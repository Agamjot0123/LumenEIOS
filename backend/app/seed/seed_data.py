"""LumenEIOS roster seed: IIT Mandi -> JNV Bengaluru and Dakshana Kottayam.

Hierarchy:
    Admin IIT Mandi controls both schools.
    JNV Bengaluru     -> teachers Arvind, Garima   -> students Gurleen (6), Agam (7), Pranay (8)
    Dakshana Kottayam -> teachers Kamlesh, Preeti  -> students Tanv (9), KVR (10), Grishma (11)
    Every student has one parent account ("<Name> ki Mummy").

Teachers see students through school membership, so a school's teachers see all of its students.
Each class lists the subjects its school's teachers teach at that grade.

Every account's password is demo123. Seeding runs only on an empty database; to reseed, delete
the database file (or run backend/scripts/reset_roster.py) and restart the backend.

The IDs school-1 and user-principal-1 are kept on purpose: some API fallbacks still name them.

Login emails:
    Classic demo personas (LoginPage / docs): admin@, principal@, teacher@, student@, parent@
    Named roster aliases also exist for admin/principal/teacher (iitmandi@, principal.jnv@, garima@).
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.security import get_password_hash
from backend.app.models.entities import (
    AuditEvent,
    ClassSection,
    ParentStudentLink,
    School,
    SchoolMembership,
    Student,
    Subject,
    User,
)
from backend.app.modules.differentiated_homework.models import StudentAccountLink

logger = logging.getLogger(__name__)

DEFAULT_PASSWORD = "demo123"
DOMAIN = "lumeneios.demo"

# LEOFELIX role-switch targets and classic LoginPage personas (see api/v1/auth.py).
ROOT_PERSONA_EMAILS = {
    "admin": f"admin@{DOMAIN}",
    "principal": f"principal@{DOMAIN}",
    "teacher": f"teacher@{DOMAIN}",
    "student": f"student@{DOMAIN}",
    "parent": f"parent@{DOMAIN}",
}

SCHOOLS = [
    {
        "id": "school-1",
        "name": "JNV Bengaluru",
        "location": "Bengaluru",
        "state": "Karnataka",
        "principal_id": "user-principal-1",
        "principal_name": "JNV Bengaluru",
        "principal_email": f"principal.jnv@{DOMAIN}",
    },
    {
        "id": "school-2",
        "name": "Dakshana Kottayam",
        "location": "Kottayam",
        "state": "Kerala",
        "principal_id": "user-principal-2",
        "principal_name": "Dakshana Kottayam",
        "principal_email": f"principal.dakshana@{DOMAIN}",
    },
]

SUBJECTS = [
    {"id": "sub-sci", "name": "Science", "code": "SCI", "grade": 6, "icon_name": "FlaskConical"},
    {"id": "sub-math", "name": "Mathematics", "code": "MATH", "grade": 6, "icon_name": "Calculator"},
    {"id": "sub-eng", "name": "English", "code": "ENG", "grade": 6, "icon_name": "BookOpen"},
    {"id": "sub-chem", "name": "Chemistry", "code": "CHEM", "grade": 11, "icon_name": "FlaskConical"},
]

TEACHERS = [
    {"key": "arvind", "name": "Arvind", "school": "school-1", "subject": "sub-chem",
     "grades": [11, 12], "designation": "Chemistry teacher, Classes 11 and 12"},
    {"key": "garima", "name": "Garima", "school": "school-1", "subject": "sub-sci",
     "grades": [6, 7, 8, 9], "designation": "Science teacher, Classes 6 to 9"},
    {"key": "kamlesh", "name": "Kamlesh", "school": "school-2", "subject": "sub-math",
     "grades": [6, 7, 8, 9], "designation": "Mathematics teacher, Classes 6 to 9"},
    {"key": "preeti", "name": "Preeti", "school": "school-2", "subject": "sub-eng",
     "grades": [6, 7, 8, 9, 10, 11], "designation": "English teacher, Classes 6 to 11"},
]

STUDENTS = [
    {"key": "gurleen", "name": "Gurleen", "school": "school-1", "grade": 6},
    {"key": "agam", "name": "Agam", "school": "school-1", "grade": 7},
    {"key": "pranay", "name": "Pranay", "school": "school-1", "grade": 8},
    {"key": "tanv", "name": "Tanv", "school": "school-2", "grade": 9},
    {"key": "kvr", "name": "KVR", "school": "school-2", "grade": 10},
    {"key": "grishma", "name": "Grishma", "school": "school-2", "grade": 11},
]

SCHOOL_SLUG = {"school-1": "jnv", "school-2": "dakshana"}

# Named emails from the upstream roster sheet (same persona names; no second StudentAccountLink).
NAMED_LOGIN_ALIASES = [
    {
        "id": "user-alias-iitmandi",
        "email": f"iitmandi@{DOMAIN}",
        "name": "IIT Mandi",
        "role": "admin",
        "school_id": "school-1",
        "designation": "Administrator alias",
        "memberships": ["school-1", "school-2"],
    },
    {
        "id": "user-alias-principal-jnv",
        "email": f"principal.jnv@{DOMAIN}",
        "name": "JNV Bengaluru",
        "role": "principal",
        "school_id": "school-1",
        "designation": "Principal alias",
        "memberships": ["school-1"],
    },
    {
        "id": "user-alias-garima",
        "email": f"garima@{DOMAIN}",
        "name": "Garima",
        "role": "teacher",
        "school_id": "school-1",
        "designation": "Science teacher alias",
        "memberships": ["school-1"],
    },
]


def class_id(school_id: str, grade: int) -> str:
    return f"class-{SCHOOL_SLUG[school_id]}-{grade}"


def build_classes() -> list[dict]:
    """One section per grade a school's teachers teach, listing the subjects taught there."""
    classes: dict[tuple[str, int], dict] = {}
    for teacher in TEACHERS:
        for grade in teacher["grades"]:
            entry = classes.setdefault((teacher["school"], grade), {
                "id": class_id(teacher["school"], grade),
                "school_id": teacher["school"],
                "grade": grade,
                "subject_ids": [],
                "teachers": [],
            })
            entry["subject_ids"].append(teacher["subject"])
            entry["teachers"].append(teacher)
    return sorted(classes.values(), key=lambda c: (c["school_id"], c["grade"]))


def roster_users() -> list[dict]:
    """Every login account, in display order. Used by the seed and the login sheet."""
    users = [{
        "id": "user-admin",
        "email": ROOT_PERSONA_EMAILS["admin"],
        "name": "IIT Mandi",
        "role": "admin",
        "school_id": "school-1",
        "designation": "Administrator, JNV Bengaluru and Dakshana Kottayam",
    }]
    for school in SCHOOLS:
        email = (
            ROOT_PERSONA_EMAILS["principal"]
            if school["id"] == "school-1"
            else school["principal_email"]
        )
        users.append({
            "id": school["principal_id"],
            "email": email,
            "name": school["principal_name"],
            "role": "principal",
            "school_id": school["id"],
            "designation": f"Principal, {school['name']}",
        })
    for teacher in TEACHERS:
        email = (
            ROOT_PERSONA_EMAILS["teacher"]
            if teacher["key"] == "garima"
            else f"{teacher['key']}@{DOMAIN}"
        )
        users.append({
            "id": f"user-teacher-{teacher['key']}",
            "email": email,
            "name": teacher["name"],
            "role": "teacher",
            "school_id": teacher["school"],
            "designation": teacher["designation"],
        })
    for student in STUDENTS:
        email = (
            ROOT_PERSONA_EMAILS["student"]
            if student["key"] == "gurleen"
            else f"{student['key']}@{DOMAIN}"
        )
        users.append({
            "id": f"student-{student['key']}",
            "email": email,
            "name": student["name"],
            "role": "student",
            "school_id": student["school"],
            "designation": f"Student, Class {student['grade']}",
        })
    for student in STUDENTS:
        email = (
            ROOT_PERSONA_EMAILS["parent"]
            if student["key"] == "gurleen"
            else f"{student['key']}.mummy@{DOMAIN}"
        )
        users.append({
            "id": f"parent-{student['key']}",
            "email": email,
            "name": f"{student['name']} ki Mummy",
            "role": "parent",
            "school_id": student["school"],
            "designation": f"Parent of {student['name']}",
        })
    return users


async def ensure_classic_demo_student_link(session: AsyncSession) -> None:
    """Idempotently link the classic Aarav Patel demo login when that roster is present.

    Student homework endpoints require an explicit StudentAccountLink. Older demo databases
    were seeded before that table existed, so teacher-assigned homework for user-student-1
    was invisible to student@lumeneios.demo. This only creates the known classic demo link
    (never infers links for arbitrary same-ID accounts) and does not wipe or reseed data.
    """
    seed_event_id = "seed-classic-demo-student-account-link-v1"
    if await session.get(AuditEvent, seed_event_id):
        return
    user = await session.get(User, "user-student-1")
    student = await session.get(Student, "user-student-1")
    if not user or not student:
        return
    if (
        user.email != f"student@{DOMAIN}"
        or user.role != "student"
        or user.school_id != "school-1"
        or student.school_id != "school-1"
        or student.name != "Aarav Patel"
    ):
        return
    if await session.scalar(select(StudentAccountLink.id).where(or_(
        StudentAccountLink.user_id == user.id,
        StudentAccountLink.student_id == student.id,
    ))):
        # Mark complete so we do not re-check forever when a link already exists.
        session.add(AuditEvent(
            id=seed_event_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            user_id="user-admin",
            user_name="System",
            category="user",
            action="Classic demo student already linked",
            details="StudentAccountLink already present for Aarav Patel demo login.",
        ))
        await session.commit()
        return
    session.add_all([
        StudentAccountLink(user_id=user.id, student_id=student.id, created_by="user-admin"),
        AuditEvent(
            id=seed_event_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            user_id="user-admin",
            user_name="System",
            category="user",
            action="Linked classic demo student",
            details="Linked student@lumeneios.demo (Aarav Patel) to roster record user-student-1.",
        ),
    ])
    await session.commit()
    logger.info("Ensured StudentAccountLink for classic demo student Aarav Patel (user-student-1).")


async def seed_database_if_empty(session: AsyncSession) -> None:
    if (await session.execute(select(School.id).limit(1))).first():
        logger.info("Database already seeded.")
        return

    logger.info("Empty database detected. Seeding the IIT Mandi roster...")
    classes = build_classes()
    names = {s["id"]: s["name"] for s in SCHOOLS}

    for school in SCHOOLS:
        session.add(School(
            id=school["id"],
            name=school["name"],
            location=school["location"],
            state=school["state"],
            infrastructure_tier="standard",
            academic_year="2026-2027",
            principal_id=school["principal_id"],
            principal_name=school["principal_name"],
            student_count=sum(1 for s in STUDENTS if s["school"] == school["id"]),
            teacher_count=sum(1 for t in TEACHERS if t["school"] == school["id"]),
            class_count=sum(1 for c in classes if c["school_id"] == school["id"]),
            pacing_risk="low",
            description=f"{school['name']}, administered by IIT Mandi.",
        ))

    for subject in SUBJECTS:
        session.add(Subject(**subject))

    password_hash = get_password_hash(DEFAULT_PASSWORD)
    for user in roster_users():
        session.add(User(**user, hashed_password=password_hash))
        session.add(SchoolMembership(
            id=f"mem-{user['id']}-{user['school_id']}", user_id=user["id"],
            school_id=user["school_id"], role=user["role"],
        ))
    # The admin controls both schools.
    session.add(SchoolMembership(
        id="mem-user-admin-school-2", user_id="user-admin", school_id="school-2", role="admin",
    ))

    for section in classes:
        lead = section["teachers"][0]
        session.add(ClassSection(
            id=section["id"],
            school_id=section["school_id"],
            grade=section["grade"],
            section="A",
            name=f"Class {section['grade']}-A",
            class_teacher_id=f"user-teacher-{lead['key']}",
            class_teacher_name=lead["name"],
            student_count=sum(
                1 for s in STUDENTS
                if s["school"] == section["school_id"] and s["grade"] == section["grade"]
            ),
            subject_ids_json=section["subject_ids"],
        ))

    # Flush parents of the foreign keys before the rows that point at them.
    await session.flush()

    for student in STUDENTS:
        student_id = f"student-{student['key']}"
        parent_id = f"parent-{student['key']}"
        session.add(Student(
            id=student_id,
            school_id=student["school"],
            class_id=class_id(student["school"], student["grade"]),
            class_name=f"Class {student['grade']}-A",
            name=student["name"],
            roll_no=1,
            parent_id=parent_id,
        ))
    await session.flush()

    for student in STUDENTS:
        student_id = f"student-{student['key']}"
        session.add(ParentStudentLink(
            id=f"psl-{student['key']}",
            parent_user_id=f"parent-{student['key']}",
            student_id=student_id,
        ))
        session.add(StudentAccountLink(
            user_id=student_id, student_id=student_id, created_by="user-admin",
        ))

    for alias in NAMED_LOGIN_ALIASES:
        session.add(User(
            id=alias["id"],
            email=alias["email"],
            name=alias["name"],
            role=alias["role"],
            school_id=alias["school_id"],
            designation=alias["designation"],
            hashed_password=password_hash,
        ))
        for membership_school in alias["memberships"]:
            session.add(SchoolMembership(
                id=f"mem-{alias['id']}-{membership_school}",
                user_id=alias["id"],
                school_id=membership_school,
                role=alias["role"],
            ))

    await session.commit()
    logger.info(
        "Seeded %d schools (%s), %d accounts, %d classes.",
        len(SCHOOLS),
        ", ".join(names.values()),
        len(roster_users()) + len(NAMED_LOGIN_ALIASES),
        len(classes),
    )
