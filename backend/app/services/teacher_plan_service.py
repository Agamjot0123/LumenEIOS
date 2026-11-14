"""Teacher-scoped plan operations. Every mutation writes its audit event in the same transaction."""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.entities import User, generate_uuid
from backend.app.models.teacher_planning import (
    PlanAuditEvent, PlanTopic, SchoolPlanCalendar, TeacherLostPeriod, TeacherTopicConfig, TeacherTopicCoverage,
    TeacherTopicRelationship,
)
from backend.app.services import annual_allocation as alloc

DEFAULT_CALENDAR = {
    "year": "2026-2027", "start": "2026-04-01", "end": "2027-03-31", "weekdays": [1, 2, 3, 4, 5], "entries": [],
    "periodsPerDay": 8, "periodMinutes": 40, "subjectPeriodsPerDay": {"Mathematics": 1, "Science": 1}, "horizonDays": None,
}
SUBJECTS = {"Mathematics", "Science"}
CLASSIFICATIONS = {"core", "non_core", "mixed"}
COVERAGE = {"done", "in_progress", "not_done"}
COVERAGE_SOURCES = {"MANUAL", "EXECUTION"}
DEMO_NOTE = "Hypothetical demonstration default; not official NCERT or expert-approved."


class PlanError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code, self.detail = status_code, detail


def audit(db: AsyncSession, actor: User, school_id: str, category: str, summary: str, *, teacher_id=None, grade=None,
          subject=None, topic_keys=None, previous=None, new=None, reason=None, schedule_version=None,
          related_event_id=None, related_proposal_id=None, status="recorded") -> PlanAuditEvent:
    ev = PlanAuditEvent(id=generate_uuid(), actor_id=actor.id, actor_name=actor.name, actor_role=actor.role, school_id=school_id,
                        teacher_id=teacher_id, grade=grade, subject=subject, topic_keys=list(topic_keys or []),
                        category=category, status=status, previous_value=previous, new_value=new, reason=reason,
                        schedule_version=schedule_version, related_event_id=related_event_id,
                        related_proposal_id=related_proposal_id, summary=summary[:500])
    db.add(ev)
    return ev


async def get_calendar(db: AsyncSession, school_id: str, year: str) -> Dict[str, Any]:
    res = await db.execute(select(SchoolPlanCalendar).filter_by(school_id=school_id, academic_year=year)
                           .order_by(SchoolPlanCalendar.version.desc()).limit(1))
    row = res.scalars().first()
    return {"version": row.version if row else 0, "config": row.config if row else {**DEFAULT_CALENDAR, "year": year}}


CATALOGUE_REF = "ncert-batch:"


async def topics_for(db: AsyncSession, grade: int, subject: str) -> List[PlanTopic]:
    res = await db.execute(select(PlanTopic).filter_by(grade=grade, subject=subject).order_by(PlanTopic.sort_order, PlanTopic.topic_key))
    rows = list(res.scalars().all())
    # Once the adopted catalogue dataset has topics for this class and subject (source_ref 'ncert-batch:<node id>'), it is the one
    # curriculum. Earlier crosswalk-only rows stay in the table (teacher records still reference them) but are not mixed in.
    adopted = [t for t in rows if (t.source_ref or "").startswith(CATALOGUE_REF)]
    return adopted or rows


def _check_combo(grade: int, subject: str) -> None:
    if subject not in SUBJECTS or grade not in (6, 7, 8):
        raise PlanError(422, "Only Classes VI-VIII Mathematics and Science are supported.")


async def ensure_defaults(db: AsyncSession, actor: User, school_id: str, teacher_id: str, year: str, grade: int,
                          subject: str) -> bool:
    """Fill missing teacher-scoped topic configs deterministically; never changes an existing decision."""
    _check_combo(grade, subject)
    topics = await topics_for(db, grade, subject)
    if not topics:
        return False
    key = dict(school_id=school_id, teacher_id=teacher_id, academic_year=year, grade=grade, subject=subject)
    existing = {c.topic_key: c for c in (await db.execute(select(TeacherTopicConfig).filter_by(**key))).scalars().all()}
    existing_coverage = {c.topic_key for c in (await db.execute(select(TeacherTopicCoverage).filter_by(**key))).scalars().all()}
    missing = [t for t in topics if t.topic_key not in existing]
    missing_coverage = [t for t in topics if t.topic_key not in existing_coverage]
    if not missing and not missing_coverage:
        return False
    cal = await get_calendar(db, school_id, year)
    p = alloc.available_periods(cal["config"], subject)
    ordered = sorted(topics, key=lambda t: (t.sort_order, t.topic_key))
    topic_cap = alloc.capacity(p)["topic_capacity"]
    preserved_total = sum(c.core_periods + c.non_core_periods for c in existing.values()
                          if c.topic_key in {t.topic_key for t in topics})
    remaining_capacity = max(0, topic_cap - preserved_total)
    rows = {r["topic_key"]: r for r in alloc.topic_allocations(
        [{"topic_key": t.topic_key, "weight": 1} for t in ordered if t.topic_key not in existing], p,
        topic_capacity_override=remaining_capacity)}
    for t in missing:
        row = rows[t.topic_key]
        db.add(TeacherTopicConfig(school_id=school_id, teacher_id=teacher_id, academic_year=year, grade=grade,
                                  subject=subject, topic_key=t.topic_key, classification=row["classification"],
                                  core_periods=row["core"], non_core_periods=row["non_core"],
                                  teaching_mode=row["teaching_mode"], independent_periods=row["independent_periods"], origin="demo_default",
                                  version=1, updated_by=actor.id))
    for t in missing_coverage:
        db.add(TeacherTopicCoverage(school_id=school_id, teacher_id=teacher_id, academic_year=year, grade=grade,
                                    subject=subject, topic_key=t.topic_key, status="not_done", source="MANUAL", updated_by=actor.id))
    if missing or missing_coverage:
        audit(db, actor, school_id, "period_requirement", f"Deterministic demonstration defaults initialized ({len(missing)} topic configs)",
              teacher_id=teacher_id, grade=grade, subject=subject, topic_keys=[t.topic_key for t in missing],
              new={"capacity": alloc.capacity(p), "config_rows_added": len(missing), "coverage_rows_added": len(missing_coverage),
                   "note": DEMO_NOTE}, reason=DEMO_NOTE)
    return True


async def build_plan(db: AsyncSession, school_id: str, teacher_id: str, year: str, grade: int, subject: str) -> Dict:
    _check_combo(grade, subject)
    cal = await get_calendar(db, school_id, year)
    p = alloc.available_periods(cal["config"], subject)
    cap = alloc.capacity(p)
    topics = {t.topic_key: t for t in await topics_for(db, grade, subject)}
    key = dict(school_id=school_id, teacher_id=teacher_id, academic_year=year, grade=grade, subject=subject)
    cfgs = [c for c in (await db.execute(select(TeacherTopicConfig).filter_by(**key))).scalars().all() if c.topic_key in topics]
    cov_rows = {c.topic_key: c for c in (await db.execute(select(TeacherTopicCoverage).filter_by(**key))).scalars().all()}
    cov = {k: c.status for k, c in cov_rows.items()}
    rels = (await db.execute(select(TeacherTopicRelationship).filter_by(
        school_id=school_id, teacher_id=teacher_id, academic_year=year, status="active", kind="PREREQUISITE"))).scalars().all()
    rows = []
    for c in sorted(cfgs, key=lambda c: (topics[c.topic_key].sort_order, c.topic_key)):
        t = topics[c.topic_key]
        rows.append({"topic_key": c.topic_key, "chapter_number": t.chapter_number, "chapter_title": t.chapter_title,
                     "section": t.section_label, "classification": c.classification, "core_periods": c.core_periods,
                     "non_core_periods": c.non_core_periods, "teaching_mode": c.teaching_mode,
                     "independent_periods": c.independent_periods, "classroom_periods": c.core_periods + c.non_core_periods - c.independent_periods,
                     "origin": c.origin, "version": c.version,
                     "coverage": cov.get(c.topic_key, "not_done"),
                     "coverage_source": cov_rows[c.topic_key].source if c.topic_key in cov_rows else "MANUAL",
                     "coverage_updated_at": cov_rows[c.topic_key].updated_at.isoformat() if c.topic_key in cov_rows and cov_rows[c.topic_key].updated_at else None,
                     "prerequisites": [r.prerequisite_key for r in rels if r.topic_key == c.topic_key]})
    check = alloc.validate_requirements(rows, cap["topic_capacity"])
    check["unallocated_topics"] = sum(1 for r in rows if r["core_periods"] + r["non_core_periods"] == 0)
    owner = (await db.execute(select(User.name).filter_by(id=teacher_id))).scalar()
    return {"school_id": school_id, "teacher_id": teacher_id, "teacher_name": owner, "academic_year": year, "grade": grade, "subject": subject,
            "calendar_version": cal["version"], "capacity": cap, "allocation": check, "topics": rows,
            "topic_count": len(topics), "configured_topic_count": len(cfgs),
            "coverage": coverage_stats(r["coverage"] for r in rows)}


def coverage_stats(statuses: Iterable[str]) -> Dict[str, Any]:
    s = list(statuses)
    done, prog = s.count("done"), s.count("in_progress")
    total = len(s)
    return {"eligible": total, "done": done, "in_progress": prog, "not_done": total - done - prog,
            "percent": round(100 * done / total, 1) if total else 0.0}


def _require_owner(actor: User, school_id: str, teacher_id: str) -> None:
    if actor.role != "teacher" or actor.id != teacher_id:
        raise PlanError(403, "Only the owning teacher can change their own plan.")
    if actor.school_id and actor.school_id != school_id:
        raise PlanError(403, "Teacher does not belong to this school.")


async def save_requirements(db: AsyncSession, actor: User, school_id: str, teacher_id: str, year: str, grade: int,
                            subject: str, items: List[Dict], reason: Optional[str]) -> Dict:
    _require_owner(actor, school_id, teacher_id)
    _check_combo(grade, subject)
    await ensure_defaults(db, actor, school_id, teacher_id, year, grade, subject)
    await db.flush()
    key = dict(school_id=school_id, teacher_id=teacher_id, academic_year=year, grade=grade, subject=subject)
    current = {t.topic_key for t in await topics_for(db, grade, subject)}
    cfgs = {c.topic_key: c for c in (await db.execute(select(TeacherTopicConfig).filter_by(**key))).scalars().all() if c.topic_key in current}
    errors: List[str] = []
    proposed = {k: {"topic_key": k, "core_periods": c.core_periods, "non_core_periods": c.non_core_periods,
                    "independent_periods": c.independent_periods, "teaching_mode": c.teaching_mode,
                    "classification": c.classification} for k, c in cfgs.items()}
    for it in items:
        k = it["topic_key"]
        if k not in cfgs:
            errors.append(f"Unknown topic {k}.")
            continue
        cls = it.get("classification", proposed[k]["classification"])
        if cls not in CLASSIFICATIONS:
            errors.append(f"{k}: invalid classification.")
            continue
        independent = it.get("independent_periods", min(proposed[k]["independent_periods"], it["non_core_periods"]))
        mode = it.get("teaching_mode", proposed[k]["teaching_mode"])
        if not isinstance(independent, int) or isinstance(independent, bool) or independent < 0 or independent > it["non_core_periods"]:
            errors.append(f"{k}: independent periods must be between 0 and Non-Core periods.")
        if mode not in ("SHARED", "INDEPENDENT"):
            errors.append(f"{k}: teaching mode must be SHARED or INDEPENDENT.")
        proposed[k].update(core_periods=it["core_periods"], non_core_periods=it["non_core_periods"],
                           independent_periods=independent, teaching_mode=mode, classification=cls)
        nc, c = it["non_core_periods"], it["core_periods"]
        if isinstance(nc, int) and isinstance(c, int):
            if cls == "core" and nc:
                errors.append(f"{k}: a Core topic cannot carry Non-Core periods; mark it mixed.")
            if cls == "non_core" and c:
                errors.append(f"{k}: a Non-Core topic cannot carry Core periods; mark it mixed.")
    cal = await get_calendar(db, school_id, year)
    cap = alloc.capacity(alloc.available_periods(cal["config"], subject))
    check = alloc.validate_requirements(proposed.values(), cap["topic_capacity"])
    check["errors"] = errors + check["errors"]
    check["valid"] = not check["errors"]
    if not check["valid"]:
        # nothing is written, so an over-capacity configuration can never persist
        raise PlanError(422, {"message": "Requirements rejected.", **check})
    changed = []
    for it in items:
        c = cfgs[it["topic_key"]]
        new = proposed[it["topic_key"]]
        if (c.core_periods, c.non_core_periods, c.classification, c.independent_periods, c.teaching_mode) == (
                new["core_periods"], new["non_core_periods"], new["classification"], new["independent_periods"], new["teaching_mode"]):
            continue
        before = {"core_periods": c.core_periods, "non_core_periods": c.non_core_periods, "classification": c.classification,
                  "independent_periods": c.independent_periods, "teaching_mode": c.teaching_mode}
        after = {k: new[k] for k in before}
        c.core_periods, c.non_core_periods, c.classification = after["core_periods"], after["non_core_periods"], after["classification"]
        c.independent_periods, c.teaching_mode = after["independent_periods"], after["teaching_mode"]
        c.origin, c.version, c.updated_by = "teacher", c.version + 1, actor.id
        changed.append(c.topic_key)
        cat = "topic_classification" if before["classification"] != after["classification"] else "period_requirement"
        audit(db, actor, school_id, cat, f"{c.topic_key}: {before} -> {after}", teacher_id=teacher_id, grade=grade,
              subject=subject, topic_keys=[c.topic_key], previous=before, new=after, reason=reason)
    return {"changed": changed, "allocation": check}


async def set_coverage(db: AsyncSession, actor: User, school_id: str, teacher_id: str, year: str, grade: int,
                       subject: str, topic_key: str, status: str, reason: Optional[str], source: str = "MANUAL") -> Dict:
    _require_owner(actor, school_id, teacher_id)
    if status not in COVERAGE:
        raise PlanError(422, "Status must be done, in_progress or not_done.")
    if source not in COVERAGE_SOURCES:
        raise PlanError(422, "Source must be MANUAL or EXECUTION.")
    await ensure_defaults(db, actor, school_id, teacher_id, year, grade, subject)
    await db.flush()
    res = await db.execute(select(TeacherTopicCoverage).filter_by(
        school_id=school_id, teacher_id=teacher_id, academic_year=year, grade=grade, subject=subject, topic_key=topic_key))
    row = res.scalars().first()
    if not row:
        raise PlanError(404, "Topic is not part of this teacher's plan.")
    if row.status != status:
        before, before_src = row.status, row.source
        row.status, row.source, row.updated_by = status, source, actor.id
        audit(db, actor, school_id, "coverage_status", f"{topic_key}: {before} -> {status} ({source})", teacher_id=teacher_id,
              grade=grade, subject=subject, topic_keys=[topic_key], previous={"status": before, "source": before_src},
              new={"status": status, "source": source}, reason=reason)
    return {"topic_key": topic_key, "status": status, "source": row.source}
