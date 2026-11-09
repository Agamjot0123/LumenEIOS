"""Database tables owned by the Differentiated Homework module.

How these tables are created: there's no migration tool set up. On startup, init_db() calls
Base.metadata.create_all, which creates missing tables and never alters or drops existing
ones. These are new tables only, so adding them is non-destructive. This module is imported
through the API router before init_db runs, so the tables are registered in time.

Snapshots: each item stores a full copy of the question at save time, so later edits or
deletions in the question bank don't change a saved draft. The answer key and rubric are
stored for future grading, but no API response returns them.
"""
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    select,
)
from sqlalchemy.orm import relationship

from backend.app.db.session import Base
from backend.app.models.entities import generate_uuid, utc_now

DRAFT_STATUSES = ("draft", "approved", "rejected", "assigned")


class HomeworkDraftRecord(Base):
    __tablename__ = "homework_drafts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'approved', 'rejected', 'assigned')", name="ck_homework_drafts_status"
        ),
    )

    id = Column(String(64), primary_key=True, default=generate_uuid)
    student_id = Column(String(64), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    school_id = Column(String(64), nullable=False, index=True)
    subject_id = Column(String(64), nullable=False)
    created_by = Column(String(64), ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), default="draft", nullable=False, index=True)

    requested_questions = Column(Integer, nullable=False)
    max_total_marks = Column(Integer, nullable=True)
    include_ai_generated = Column(Boolean, nullable=False)
    question_count = Column(Integer, nullable=False)
    total_marks = Column(Integer, nullable=False)
    shortfall = Column(Integer, nullable=False)
    rationale_json = Column(JSON, nullable=False)
    notes_json = Column(JSON, default=list, nullable=False)

    reviewed_by = Column(String(64), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    # Optimistic-concurrency version counter, managed by SQLAlchemy: every UPDATE requires the
    # number this request read and adds 1. If another request changed the row in between, the
    # UPDATE matches nothing and SQLAlchemy raises StaleDataError (returned as 409).
    # An integer, not a timestamp: on Windows most consecutive clock readings are identical, so
    # a timestamp version could stay the same across two updates and miss a conflict.
    version = Column(Integer, nullable=False)

    __mapper_args__ = {"version_id_col": version}

    items = relationship(
        "HomeworkDraftItemRecord",
        back_populates="draft",
        cascade="all, delete-orphan",
        order_by="HomeworkDraftItemRecord.position",
        lazy="selectin",
    )


class HomeworkDraftItemRecord(Base):
    __tablename__ = "homework_draft_items"
    __table_args__ = (
        UniqueConstraint("draft_id", "position", name="uq_homework_draft_items_position"),
        UniqueConstraint("draft_id", "source_question_id", name="uq_homework_draft_items_question"),
    )

    id = Column(String(64), primary_key=True, default=generate_uuid)
    draft_id = Column(String(64), ForeignKey("homework_drafts.id", ondelete="CASCADE"), nullable=False, index=True)
    position = Column(Integer, nullable=False)
    # Not a foreign key on purpose: the snapshot must survive if the bank question is deleted.
    source_question_id = Column(String(64), nullable=False)

    text = Column(Text, nullable=False)
    type = Column(String(50), nullable=False)
    options_json = Column(JSON, default=list, nullable=False)
    marks = Column(Integer, nullable=False)
    competency = Column(String(20), nullable=False)
    competency_rank = Column(Integer, nullable=False)
    bloom_level = Column(String(50), nullable=False)
    is_ai_generated = Column(Boolean, nullable=False)
    # Stored for future grading. Never returned by any API response.
    correct_answer = Column(Text, nullable=True)
    marking_rubric = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utc_now, nullable=False)

    draft = relationship("HomeworkDraftRecord", back_populates="items")


class HomeworkAssignmentRecord(Base):
    """An approved draft issued to its student.

    Questions aren't copied: the assignment shows the draft's snapshot items, which can no
    longer change once the draft's status is 'assigned'. A draft can be assigned only once,
    enforced by the unique draft_id.

    status: only 'assigned' exists for now, validated by the application. There's deliberately
    no CHECK constraint, because SQLite can't change one without rebuilding the table, and
    later statuses (for submission) would need that.
    """

    __tablename__ = "homework_assignments"
    __table_args__ = (UniqueConstraint("draft_id", name="uq_homework_assignments_draft"),)

    id = Column(String(64), primary_key=True, default=generate_uuid)
    draft_id = Column(String(64), ForeignKey("homework_drafts.id"), nullable=False)
    student_id = Column(String(64), ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    school_id = Column(String(64), nullable=False, index=True)
    subject_id = Column(String(64), nullable=False, index=True)
    assigned_by = Column(String(64), ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=utc_now, nullable=False)
    due_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="assigned", nullable=False, index=True)

    draft = relationship("HomeworkDraftRecord", lazy="selectin")


class AssignedDraftDeletionError(Exception):
    """Raised when something tries to delete a draft that has been assigned."""


@event.listens_for(HomeworkDraftRecord, "before_delete")
def _refuse_deleting_assigned_drafts(mapper, connection, target):
    """Deleting a draft cascades to its question snapshots, which an assignment depends on.

    No endpoint deletes drafts, but scripts or admin code using the ORM could. SQLite foreign
    keys are off in this app, so the database wouldn't stop it. Checked against the
    assignments table, not just the status, so it holds even if the status were changed.
    """
    assigned = connection.execute(
        select(HomeworkAssignmentRecord.id).where(HomeworkAssignmentRecord.draft_id == target.id).limit(1)
    ).first()
    if assigned is not None or target.status == "assigned":
        raise AssignedDraftDeletionError(f"Draft {target.id} has been assigned and can't be deleted.")
