# Differentiated Homework Module

Backend for giving students homework matched to their learning needs, with teacher oversight.

**Current state: foundation only.** This module holds the existing homework routes, moved here unchanged. The differentiated features below are planned and not implemented yet.

## What it does today

| Capability | State |
|---|---|
| Create a homework task for one student | Partial: inputs are barely validated |
| List homework by class or student | Works; record-level access checks are limited |
| Submit homework | **Mock:** accepts no answers and always records a score of 92 |
| Recommend remediation | Partial: picks the lowest of LU, CU, AU and CT, then returns one of four fixed maths-specific texts |

## Planned, not implemented

- Learning gap analysis
- Pedagogical strategies
- Question selection by subject, topic, competency, difficulty and cognitive level
- AI-assisted question generation for gaps in the question bank
- Homework for students or groups
- Teacher review and approval
- Real submissions, evaluation and feedback

## Responsibilities and boundaries

**This module owns:** homework workflow, strategy and question selection logic, and the homework API.

**This module doesn't own:** OCR, grading, assessment and diagnosis, the question generation pipeline, the time-aware engine, shared backend infrastructure, or the frontend.

**Code outside this folder that it relies on:**

| Code | Location | Note |
|---|---|---|
| `HomeworkRemediation` model | `backend/app/models/entities.py` | All models currently share this file |
| `HomeworkOut` schema | `backend/app/schemas/competencies.py` | Homework is its only user today |
| `generate_differentiated_recommendation` | `backend/app/services/competency_service.py` | Stays there until its logic is replaced |
| `get_db`, `get_current_user`, `require_roles` | `backend/app/db/session.py`, `backend/app/api/dependencies.py` | Shared infrastructure |
| Router registration | `backend/app/api/v1/router.py` | One import line points here |

## Architecture

```text
HTTP request
    |
    v
router.py  (this module: validates input, checks role, handles the request)
    |
    +--> competency_service.py   recommendation logic
    +--> entities.py             HomeworkRemediation, Student, AuditEvent
    |
    v
Database, through the shared session
```

## Setup

Run all commands from `apps/lumeneios/`.

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

API docs are at `http://localhost:8000/api/v1/docs`. The first start creates and seeds a local `lumeneios.db`, which git ignores.

## Running tests

```bash
python -m pytest backend/tests -v -p no:cacheprovider
```

`backend/tests/conftest.py` redirects each run to a temporary database and upload folder, and stops if those paths are unsafe. Your local `lumeneios.db` and `storage_uploads/` aren't used.

## API endpoints

All paths are under `/api/v1`.

| Method and path | Role check in code | State |
|---|---|---|
| `GET /classes/{class_id}/homework` | Any logged-in user | Works |
| `POST /classes/{class_id}/homework` | admin, principal, teacher | Partial |
| `GET /students/{student_id}/homework` | Logged-in user; students limited to their own ID | Partial |
| `POST /homework/{homework_id}/submissions` | Any logged-in user | **Mock** |
| `GET /students/{student_id}/remediation/recommendation` | Any logged-in user | Partial |

## Integration with other modules

See [the API contract](../../../../../../docs/api-contracts/differentiated-homework.md). **Those interfaces are proposed and haven't been agreed with the owning teammates.**
