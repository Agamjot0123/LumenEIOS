from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from backend.app.api.dependencies import get_current_user, require_roles
from backend.app.db.session import get_db
from backend.app.models.entities import HomeworkRemediation, Student, User, AuditEvent, utc_now
from backend.app.schemas.competencies import HomeworkOut
from backend.app.services.competency_service import generate_differentiated_recommendation
import logging

from pydantic import ValidationError

from backend.app.modules.differentiated_homework.access import can_view_student, role_may_view_students
from backend.app.modules.differentiated_homework.competency_adapter import load_competency_profile
from backend.app.modules.differentiated_homework.gap_analyzer import analyze_gaps
from backend.app.modules.differentiated_homework.schemas import GapAnalysis
from backend.app.models.entities import ClassSection, Subject
from backend.app.modules.differentiated_homework.access import role_may_generate_homework
from backend.app.modules.differentiated_homework.homework_assembler import AssemblyError, assemble_homework_draft
from backend.app.modules.differentiated_homework.question_bank_adapter import load_candidate_questions
from backend.app.modules.differentiated_homework.question_selector import select_questions
from backend.app.modules.differentiated_homework.schemas import (
    HomeworkDraft,
    HomeworkPreviewRequest,
    SelectionRequest,
)
from fastapi import Query
from backend.app.models.entities import SchoolMembership
from backend.app.modules.differentiated_homework.access import can_access_draft
from backend.app.modules.differentiated_homework.draft_service import (
    InvalidEdit,
    InvalidTransition,
    StaleQuestion,
    apply_review,
    build_draft_record,
    remove_item,
    renumber_and_recount,
    stage_renumber,
    to_out,
    to_summary,
)
from sqlalchemy.orm.exc import StaleDataError
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from backend.app.modules.differentiated_homework.access import can_access_assignment
from backend.app.modules.differentiated_homework.draft_service import (
    build_assignment,
    to_assignment_out,
    to_assignment_summary,
)
from backend.app.modules.differentiated_homework.models import HomeworkAssignmentRecord
from backend.app.modules.differentiated_homework.schemas import (
    AssignmentOut,
    AssignmentStatus,
    AssignmentSummaryOut,
    AssignRequest,
)
from backend.app.modules.differentiated_homework.models import HomeworkDraftRecord
from backend.app.modules.differentiated_homework.question_bank_adapter import load_question_snapshots
from backend.app.modules.differentiated_homework.schemas import (
    DraftReviewRequest,
    DraftStatus,
    HomeworkDraftSaveRequest,
    SavedDraftOut,
    SavedDraftSummaryOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Homework & Remediation"])


class HomeworkCreate(BaseModel):
    student_id: str
    class_id: str
    subject_id: str = "sub-math"
    title: str
    competency_target: str
    reason: Optional[str] = None
    description: str
    due_date: str


@router.get("/classes/{class_id}/homework", response_model=List[HomeworkOut])
async def list_class_homework(class_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(HomeworkRemediation).filter(HomeworkRemediation.class_id == class_id))
    return res.scalars().all()


@router.post("/classes/{class_id}/homework", response_model=HomeworkOut, status_code=status.HTTP_201_CREATED)
async def assign_homework(
    class_id: str,
    req: HomeworkCreate,
    db: AsyncSession = Depends(get_db),
    educator: User = Depends(require_roles("admin", "principal", "teacher"))
):
    st_res = await db.execute(select(Student).filter(Student.id == req.student_id))
    st = st_res.scalars().first()
    student_name = st.name if st else "Student"

    hw = HomeworkRemediation(
        student_id=req.student_id,
        student_name=student_name,
        class_id=class_id,
        subject_id=req.subject_id,
        title=req.title,
        competency_target=req.competency_target,
        reason=req.reason,
        description=req.description,
        due_date=req.due_date,
        status="assigned"
    )
    db.add(hw)

    audit = AuditEvent(
        timestamp=utc_now().strftime("%Y-%m-%d %H:%M"),
        user_id=educator.id,
        user_name=educator.name,
        action="Assigned Differentiated Remediation",
        details=f"Assigned {req.competency_target} task '{req.title}' to {student_name}",
        category="curriculum"
    )
    db.add(audit)
    await db.commit()
    await db.refresh(hw)
    return hw


@router.get("/students/{student_id}/homework", response_model=List[HomeworkOut])
async def list_student_homework(student_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == "student" and current_user.id != student_id:
        raise HTTPException(status_code=403, detail="Access denied.")

    res = await db.execute(select(HomeworkRemediation).filter(HomeworkRemediation.student_id == student_id))
    return res.scalars().all()


@router.post("/homework/{homework_id}/submissions")
async def submit_homework(homework_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    res = await db.execute(select(HomeworkRemediation).filter(HomeworkRemediation.id == homework_id))
    hw = res.scalars().first()
    if not hw:
        raise HTTPException(status_code=404, detail="Homework not found.")

    hw.status = "submitted"
    hw.score = 92
    await db.commit()
    return {"message": "Homework submitted successfully.", "score": 92}


@router.get("/students/{student_id}/remediation/recommendation")
async def get_student_remediation_recommendation(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    st_res = await db.execute(select(Student).filter(Student.id == student_id))
    st = st_res.scalars().first()
    if not st:
        raise HTTPException(status_code=404, detail="Student not found.")
    return generate_differentiated_recommendation(st)


@router.get("/students/{student_id}/homework/gap-analysis", response_model=GapAnalysis)
async def get_student_gap_analysis(
    student_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only: rank the student's LU, CU, AU and CT scores and report the weakest.

    Access rules are in access.py. Scores come from the temporary competency adapter and
    are unverified, so the result is a relative comparison, not a diagnosis.
    """
    # Roles that can never view student analysis are refused before any lookup, so they
    # can't use this endpoint to find out which student IDs exist.
    if not role_may_view_students(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    result = await db.execute(select(Student).filter(Student.id == student_id))
    student = result.scalars().first()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    if not await can_view_student(db, current_user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    try:
        profile = await load_competency_profile(db, student_id)
    except ValidationError:
        # Stored data is out of range or malformed. Don't return or log the values.
        logger.warning("Invalid stored competency scores for a student; gap analysis refused.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="This student's competency data is invalid. Contact an administrator.",
        )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    return analyze_gaps(profile)


INVALID_DATA = "This student's data is invalid. Contact an administrator."


@router.post("/students/{student_id}/homework/preview", response_model=HomeworkDraft)
async def preview_student_homework(
    student_id: str,
    body: HomeworkPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Build an unsaved homework draft for one student. Nothing is written to the database.

    Runs the existing pipeline: competency adapter, Gap Analyzer, question bank adapter,
    Question Selector, Homework Assembler. The school comes from the student's record.
    """
    return await _generate_draft(db, current_user, student_id, body)


async def _generate_draft(
    db: AsyncSession, current_user: User, student_id: str, body: HomeworkPreviewRequest
) -> HomeworkDraft:
    """Shared by preview and save: checks access and inputs, then runs the pipeline. No writes."""
    if not role_may_generate_homework(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    student = (await db.execute(select(Student).filter(Student.id == student_id))).scalars().first()
    if student is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")
    if not await can_view_student(db, current_user, student):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    # The subject must exist and be offered by the student's own class (agreed rule).
    subject = (await db.execute(select(Subject.id).filter(Subject.id == body.subject_id))).first()
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found.")
    student_class = (
        await db.execute(select(ClassSection).filter(ClassSection.id == student.class_id))
    ).scalars().first()
    if (
        student_class is None
        or student_class.school_id != student.school_id
        or not isinstance(student_class.subject_ids_json, list)
    ):
        logger.warning("Student class record missing or inconsistent; homework preview refused.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=INVALID_DATA)
    if body.subject_id not in student_class.subject_ids_json:
        raise HTTPException(
            status_code=422,  # plain number: the named constant differs between Starlette versions
            detail="This subject isn't offered in the student's class.",
        )

    try:
        profile = await load_competency_profile(db, student_id)
    except ValidationError:
        logger.warning("Invalid stored competency scores for a student; homework preview refused.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="This student's competency data is invalid. Contact an administrator.",
        )
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    analysis = analyze_gaps(profile)
    selection_request = SelectionRequest(
        school_id=student.school_id,
        subject_id=body.subject_id,
        max_questions=body.max_questions,
        max_total_marks=body.max_total_marks,
        include_ai_generated=body.include_ai_generated,
    )
    loaded = await load_candidate_questions(db, student.school_id, body.subject_id)
    selection = select_questions(analysis, loaded.candidates, selection_request)

    try:
        draft = assemble_homework_draft(analysis, selection, selection_request)
    except AssemblyError:
        # The pipeline produced inconsistent data; this is a server fault, not a client error.
        logger.exception("Homework assembly failed on pipeline output.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Homework preview failed.")

    if loaded.malformed_question_ids:
        note = f"{len(loaded.malformed_question_ids)} question bank row(s) couldn't be read and were skipped."
        draft = draft.model_copy(update={"notes": [*draft.notes, note]})
    return draft


# --- Saved homework drafts ------------------------------------------------------------


def _audit(user: User, action: str, details: str) -> AuditEvent:
    return AuditEvent(
        timestamp=utc_now().strftime("%Y-%m-%d %H:%M"),
        user_id=user.id,
        user_name=user.name,
        action=action,
        details=details,
        category="curriculum",
    )


async def _accessible_school_ids(db: AsyncSession, user: User) -> set:
    ids = {user.school_id} if user.school_id else set()
    rows = await db.execute(
        select(SchoolMembership.school_id).filter(
            SchoolMembership.user_id == user.id,
            SchoolMembership.is_active == True,  # noqa: E712 (SQL comparison)
        )
    )
    ids.update(r.school_id for r in rows.all())
    return ids


async def _load_draft_for(db: AsyncSession, user: User, draft_id: str) -> HomeworkDraftRecord:
    if not role_may_generate_homework(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    record = (
        await db.execute(select(HomeworkDraftRecord).filter(HomeworkDraftRecord.id == draft_id))
    ).scalars().first()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found.")
    if not await can_access_draft(db, user, record):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return record


@router.post("/students/{student_id}/homework/drafts", response_model=SavedDraftOut, status_code=201)
async def save_homework_draft(
    student_id: str,
    body: HomeworkDraftSaveRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Explicitly save a homework draft. The server regenerates it with the same pipeline as
    the preview, so a client can't post altered questions. Saved with status 'draft'."""
    draft = await _generate_draft(db, current_user, student_id, body)

    question_ids = [item.question_id for item in draft.items]
    if body.expected_question_ids is not None and body.expected_question_ids != question_ids:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected questions have changed since the preview. Preview again before saving.",
        )
    if not question_ids:
        raise HTTPException(status_code=422, detail="There are no questions to save.")

    snapshots = await load_question_snapshots(db, question_ids, draft.school_id, draft.subject_id)
    try:
        record = build_draft_record(draft, snapshots, body, created_by=current_user.id)
    except StaleQuestion:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A selected question changed while saving. Preview again before saving.",
        )

    db.add(record)
    db.add(_audit(current_user, "Saved Homework Draft",
                  f"Saved homework draft for student {draft.student_id} ({draft.question_count} questions)."))
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return to_out(record)


@router.get("/homework/drafts", response_model=List[SavedDraftSummaryOut])
async def list_homework_drafts(
    draft_status: Optional[DraftStatus] = Query(default=None, alias="status"),
    student_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Drafts the user may see: admin all, principal their schools, teacher their own."""
    if not role_may_generate_homework(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    query = select(HomeworkDraftRecord)
    if current_user.role != "admin":
        schools = await _accessible_school_ids(db, current_user)
        query = query.filter(HomeworkDraftRecord.school_id.in_(schools))
        if current_user.role == "teacher":
            query = query.filter(HomeworkDraftRecord.created_by == current_user.id)
    if draft_status:
        query = query.filter(HomeworkDraftRecord.status == draft_status)
    if student_id:
        query = query.filter(HomeworkDraftRecord.student_id == student_id)

    rows = await db.execute(query.order_by(HomeworkDraftRecord.created_at.desc(), HomeworkDraftRecord.id))
    return [to_summary(r) for r in rows.scalars().all()]


@router.get("/homework/drafts/{draft_id}", response_model=SavedDraftOut)
async def get_homework_draft(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return to_out(await _load_draft_for(db, current_user, draft_id))


CHANGED_ELSEWHERE = "This draft was changed by another request. Reload it and try again."


async def _commit_or_conflict(db: AsyncSession) -> None:
    """Commit; if another request changed the draft first (version mismatch), roll back and 409."""
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CHANGED_ELSEWHERE)


async def _review(db: AsyncSession, user: User, draft_id: str, action: str, note) -> SavedDraftOut:
    record = await _load_draft_for(db, user, draft_id)
    try:
        apply_review(record, action, user.id, note)
    except InvalidTransition as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    db.add(_audit(user, f"Homework Draft {action.capitalize()}", f"{action} draft {record.id}."))
    await _commit_or_conflict(db)
    return to_out(record)


@router.post("/homework/drafts/{draft_id}/approve", response_model=SavedDraftOut)
async def approve_homework_draft(
    draft_id: str,
    body: Optional[DraftReviewRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _review(db, current_user, draft_id, "approve", body.note if body else None)


@router.post("/homework/drafts/{draft_id}/reject", response_model=SavedDraftOut)
async def reject_homework_draft(
    draft_id: str,
    body: Optional[DraftReviewRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _review(db, current_user, draft_id, "reject", body.note if body else None)


@router.post("/homework/drafts/{draft_id}/reopen", response_model=SavedDraftOut)
async def reopen_homework_draft(
    draft_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move a rejected draft back to 'draft' so it can be edited."""
    return await _review(db, current_user, draft_id, "reopen", None)


@router.delete("/homework/drafts/{draft_id}/items/{position}", response_model=SavedDraftOut)
async def remove_homework_draft_item(
    draft_id: str,
    position: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove one question from a draft in 'draft' status; positions and totals are updated."""
    record = await _load_draft_for(db, current_user, draft_id)
    try:
        removed = remove_item(record, position)
    except LookupError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No question at that position.")
    except InvalidEdit as exc:
        code = status.HTTP_409_CONFLICT if record.status != "draft" else 422
        raise HTTPException(status_code=code, detail=str(exc))

    try:
        await db.flush()  # delete the removed item first
        stage_renumber(record)
        await db.flush()  # temporary positions, so final numbering can't collide
    except StaleDataError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CHANGED_ELSEWHERE)
    renumber_and_recount(record, removed)
    db.add(_audit(current_user, "Homework Draft Edited",
                  f"Removed question {removed.source_question_id} from draft {record.id}."))
    await _commit_or_conflict(db)
    return to_out(record)


# --- Homework assignments ---------------------------------------------------------------


@router.post("/homework/drafts/{draft_id}/assign", response_model=AssignmentOut, status_code=201)
async def assign_homework_draft(
    draft_id: str,
    body: Optional[AssignRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Issue an approved draft to its student. Creates the assignment and marks the draft
    'assigned' in one transaction. Student, school and teacher come from the server."""
    record = await _load_draft_for(db, current_user, draft_id)

    existing = (await db.execute(
        select(HomeworkAssignmentRecord.id).filter(HomeworkAssignmentRecord.draft_id == record.id)
    )).first()
    if existing is not None or record.status == "assigned":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This draft has already been assigned.")

    due_at = body.due_at if body else None
    if due_at is not None and due_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail="The due date must be in the future.")

    try:
        apply_review(record, "assign", current_user.id, None)
    except InvalidTransition:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Only approved drafts can be assigned; this one is {record.status}.",
        )

    assignment = build_assignment(record, current_user.id, due_at)
    db.add(assignment)
    db.add(_audit(current_user, "Homework Assigned",
                  f"Assigned draft {record.id} to student {record.student_id}."))
    try:
        await db.commit()
    except StaleDataError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=CHANGED_ELSEWHERE)
    except IntegrityError:
        await db.rollback()
        # Only a duplicate (another request assigned this draft first, hitting the unique
        # draft_id) is a 409. Any other integrity failure is a server fault: re-raise it.
        duplicate = (await db.execute(
            select(HomeworkAssignmentRecord.id).filter(HomeworkAssignmentRecord.draft_id == draft_id)
        )).first()
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This draft has already been assigned.")
        raise
    return to_assignment_out(assignment)


@router.get("/homework/assignments", response_model=List[AssignmentSummaryOut])
async def list_homework_assignments(
    student_id: Optional[str] = None,
    subject_id: Optional[str] = None,
    assignment_status: Optional[AssignmentStatus] = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assignments the user may see, filtered in the database query."""
    if not role_may_generate_homework(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

    query = (
        select(HomeworkAssignmentRecord)
        .join(HomeworkDraftRecord, HomeworkAssignmentRecord.draft_id == HomeworkDraftRecord.id)
        # Summaries need draft totals but not the questions: skip loading items (and fail loudly
        # if anything tries to read them).
        .options(selectinload(HomeworkAssignmentRecord.draft).raiseload(HomeworkDraftRecord.items))
    )
    if current_user.role != "admin":
        schools = await _accessible_school_ids(db, current_user)
        query = query.filter(HomeworkAssignmentRecord.school_id.in_(schools))
        if current_user.role == "teacher":
            query = query.filter(HomeworkDraftRecord.created_by == current_user.id)
    if student_id:
        query = query.filter(HomeworkAssignmentRecord.student_id == student_id)
    if subject_id:
        query = query.filter(HomeworkAssignmentRecord.subject_id == subject_id)
    if assignment_status:
        query = query.filter(HomeworkAssignmentRecord.status == assignment_status)

    rows = await db.execute(
        query.order_by(HomeworkAssignmentRecord.assigned_at.desc(), HomeworkAssignmentRecord.id)
    )
    return [to_assignment_summary(a) for a in rows.scalars().all()]


@router.get("/homework/assignments/{assignment_id}", response_model=AssignmentOut)
async def get_homework_assignment(
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not role_may_generate_homework(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    assignment = (await db.execute(
        select(HomeworkAssignmentRecord).filter(HomeworkAssignmentRecord.id == assignment_id)
    )).scalars().first()
    if assignment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found.")
    if not await can_access_assignment(db, current_user, assignment):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return to_assignment_out(assignment)

