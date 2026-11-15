"""Catalogue maintenance for teachers, and the signed-in student's own graph."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import require_roles
from backend.app.db.session import get_db
from backend.app.models.entities import User
from backend.app.modules.differentiated_homework.student_access import require_linked_student
from backend.app.schemas.knowledge_components import (
    DemoWalkthroughOut,
    KnowledgeComponentCreate,
    KnowledgeComponentOut,
    KnowledgeGraphOut,
    RelationshipCreate,
    RelationshipOut,
)
from backend.app.services import kc_demo_walkthrough, kc_graph_service

router = APIRouter(tags=["Knowledge Components"])


@router.get("/knowledge-components", response_model=list[KnowledgeComponentOut])
async def list_knowledge_components(
    subject_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin", "principal", "teacher", authenticated=True)),
):
    return await kc_graph_service.list_components(db, subject_id)


@router.post("/knowledge-components", response_model=KnowledgeComponentOut, status_code=201)
async def create_knowledge_component(
    body: KnowledgeComponentCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin", "principal", "teacher", authenticated=True)),
):
    try:
        return await kc_graph_service.create_component(
            db,
            name=body.name,
            description=body.description,
            subject_id=body.subject_id,
            topic=body.topic,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Subject not found.") from None
    except ValueError as exc:
        if str(exc) == "duplicate":
            raise HTTPException(status_code=409, detail="That concept already exists for this subject and topic.") from None
        raise HTTPException(status_code=422, detail="Name and topic are required.") from None


@router.get("/knowledge-components/relationships", response_model=list[RelationshipOut])
async def list_knowledge_relationships(
    subject_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin", "principal", "teacher", authenticated=True)),
):
    return await kc_graph_service.list_relationships(db, subject_id)


@router.post("/knowledge-components/relationships", response_model=RelationshipOut, status_code=201)
async def create_knowledge_relationship(
    body: RelationshipCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin", "principal", "teacher", authenticated=True)),
):
    try:
        return await kc_graph_service.create_relationship(
            db,
            source_id=body.source_id,
            target_id=body.target_id,
            relationship=body.relationship,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Knowledge component not found.") from None
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


@router.get("/knowledge-components/demo-walkthrough", response_model=DemoWalkthroughOut)
async def preview_demo_walkthrough(
    subject_id: str = Query(min_length=1),
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_roles("admin", "principal", "teacher", authenticated=True)),
):
    try:
        return await kc_demo_walkthrough.prepare_demo(db, teacher, subject_id)
    except LookupError as exc:
        raise _demo_error(exc) from None


@router.post("/knowledge-components/demo-walkthrough", response_model=DemoWalkthroughOut)
async def run_demo_walkthrough(
    subject_id: str = Query(min_length=1),
    db: AsyncSession = Depends(get_db),
    teacher: User = Depends(require_roles("admin", "principal", "teacher", authenticated=True)),
):
    try:
        return await kc_demo_walkthrough.evaluate_demo(db, teacher, subject_id)
    except LookupError as exc:
        raise _demo_error(exc) from None


def _demo_error(exc: LookupError) -> HTTPException:
    reason = str(exc)
    if reason == "subject":
        return HTTPException(status_code=404, detail="Subject not found.")
    if reason == "class":
        return HTTPException(status_code=404, detail="No class in this school studies that subject.")
    return HTTPException(status_code=404, detail="The student persona has no linked student record.")


@router.get("/students/me/knowledge-graph", response_model=KnowledgeGraphOut)
async def my_knowledge_graph(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("student", authenticated=True)),
):
    student = await require_linked_student(db, current_user)
    return await kc_graph_service.build_student_graph(db, student.id)
