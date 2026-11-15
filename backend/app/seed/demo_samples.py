"""Deterministic DEMONSTRATION samples for a development/demo database (explicit command only; never run at startup).

For every eligible teacher plan: the first six syllabus topics get the representative classifications
  Mixed 3 Core + 1 Non-Core | Core-only 4 + 0 | Non-Core-only 0 + 4   (twice, in that order)
and the first teacher plan of each school also gets a Done topic pair and one In-progress topic so the screens show completed,
partial and untouched work together. These are demonstration planning values, NOT official NCERT classifications.

Safe by construction: a topic is changed only while it is still an untouched planning default (origin 'demo_default', coverage 'not_done');
a teacher's own edits and any coverage already recorded are never overwritten. Same input, same output, every time. Idempotent.
"""
from typing import Dict, List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.teacher_planning import TeacherTopicConfig, TeacherTopicCoverage
from backend.app.services import syllabus_seed as ss
from backend.app.services import teacher_plan_service as svc

PATTERN: List[Tuple[str, int, int]] = [("mixed", 3, 1), ("core", 4, 0), ("non_core", 0, 4)] * 2


async def seed_demo_samples(db: AsyncSession) -> Dict[str, int]:
    classified = coverage_set = 0
    first_of_school: Dict[str, bool] = {}
    combos = sorted(tuple(r) for r in (await db.execute(select(TeacherTopicConfig.school_id, TeacherTopicConfig.teacher_id, TeacherTopicConfig.academic_year,
                                                            TeacherTopicConfig.grade, TeacherTopicConfig.subject).distinct())).all())
    for school_id, teacher_id, year, grade, subject in combos:
        topics = [t for t in await svc.topics_for(db, grade, subject)]
        keys = [t.topic_key for t in sorted(topics, key=lambda t: (t.sort_order, t.topic_key))]
        key = dict(school_id=school_id, teacher_id=teacher_id, academic_year=year, grade=grade, subject=subject)
        cfgs = {c.topic_key: c for c in (await db.execute(select(TeacherTopicConfig).filter_by(**key))).scalars().all()}
        covs = {c.topic_key: c for c in (await db.execute(select(TeacherTopicCoverage).filter_by(**key))).scalars().all()}
        for k, (cls, core, non) in zip(keys, PATTERN):
            c = cfgs.get(k)
            if c is None or c.origin != "demo_default" or covs.get(k) is None or covs[k].status != "not_done":
                continue
            if (c.classification, c.core_periods, c.non_core_periods) != (cls, core, non):
                c.classification, c.core_periods, c.non_core_periods = cls, core, non
                c.independent_periods = min(c.independent_periods, non)
                c.version += 1
                classified += 1
        if school_id not in first_of_school:
            first_of_school[school_id] = True
            for k, status in zip(keys[:3], ("done", "done", "in_progress")):
                cv = covs.get(k)
                if cv is not None and cv.status == "not_done":
                    cv.status, cv.updated_by, cv.source = status, ss.SYSTEM.id, "MANUAL"
                    coverage_set += 1
    await db.commit()
    return {"topics_classified": classified, "coverage_set": coverage_set}
