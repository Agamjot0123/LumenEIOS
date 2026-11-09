"""Read-only access to the question bank for Differentiated Homework.

Loads only the fields the selector needs. Correct answers, rubrics and options are never
loaded, so they can't leak into homework selections. Questions are never modified.

School and subject filters are applied in the SQL query, not after loading.

Rows whose stored values have the wrong type (SQLite doesn't enforce column types) are
skipped and their IDs reported, so one bad row can't block selection for everyone.

Known data limits (as of this version):
- No topic, difficulty or review/approval field exists, so none is used.
- `competency` is free text; the selector normalises it and reports unsupported values.
- `subject_id` is not a foreign key, so an unknown subject simply matches nothing.
"""
import logging

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import QuestionBankItem
from backend.app.modules.differentiated_homework.schemas import CandidateQuestion, QuestionBankLoad

logger = logging.getLogger(__name__)


async def load_candidate_questions(db: AsyncSession, school_id: str, subject_id: str) -> QuestionBankLoad:
    """Return the school's questions for one subject, ordered by question ID."""
    result = await db.execute(
        select(
            QuestionBankItem.id,
            QuestionBankItem.school_id,
            QuestionBankItem.subject_id,
            QuestionBankItem.text,
            QuestionBankItem.type,
            QuestionBankItem.marks,
            QuestionBankItem.competency,
            QuestionBankItem.bloom_level,
            QuestionBankItem.is_ai_generated,
        )
        .filter(QuestionBankItem.school_id == school_id, QuestionBankItem.subject_id == subject_id)
        .order_by(QuestionBankItem.id)
    )

    candidates, malformed = [], []
    for row in result.all():
        try:
            candidates.append(CandidateQuestion(**row._mapping))
        except ValidationError:
            malformed.append(str(row.id))

    if malformed:
        logger.warning("Skipped %d malformed question bank row(s).", len(malformed))
    return QuestionBankLoad(candidates=candidates, malformed_question_ids=malformed)
