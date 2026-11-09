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

## Implemented in this module

| Component | Files | What it does |
|---|---|---|
| **Gap Analyzer** (service only; no endpoint yet) | `gap_analyzer.py`, `schemas.py` | Ranks a student's LU, CU, AU and CT scores and reports the lowest. Ties are reported as ties, and all-equal scores mean no weakest. **No threshold is applied:** "weakest" means lowest relative to the student's own scores |
| **Competency adapter** (temporary) | `competency_adapter.py` | The only reader of competency data. Reads `Student` live and baseline scores, read-only. Rejects out-of-range values. To be replaced when the assessment engine provides diagnosis |

| **Question Selector** (service only; no endpoint) | `question_selector.py`, `schemas.py` | `select_questions(analysis, candidates, request)` picks question bank items for the weaker competencies. Pure logic, deterministic |
| **Question bank adapter** | `question_bank_adapter.py` | `load_candidate_questions(db, school_id, subject_id)` returns `QuestionBankLoad`: candidates plus IDs of malformed rows, which are skipped, not allowed to crash the load. Read-only; filters by school and subject in SQL; never loads answers, rubrics or options |

Tests: `backend/tests/test_homework_gap_analyzer.py`, `test_homework_gap_analysis_api.py`, `test_homework_question_selection.py`.

### How question selection works

1. **Filter.** Candidates are first sorted on all their fields, so the result never depends on input order. Each excluded question is counted under the first rule it breaks:
   - duplicate ID: any later copy of an ID already seen
   - wrong school or wrong subject
   - unsupported competency
   - marks below 1
   - AI-generated, unless requested
   - duplicate text: same as an already-accepted question, ignoring case and spacing; the lowest ID is kept
2. **Prioritise.** Competencies are grouped by gap-analysis rank, weakest first; tied scores share a group.
3. **Fill.** Questions come from the weakest group first. Tied competencies take turns, and within a competency questions are taken in ID order.
4. **Marks limit.** If the caller sets one, a question that doesn't fit is skipped and the next is tried.
5. **Report.** The result includes the selection, total marks, shortfall, eligible counts per competency, exclusion counts and notes.

**The caller decides** the number of questions, an optional marks limit, and whether AI-generated questions may be used. AI questions have no review status, so there's no default.

**Provisional policy, not agreed by the team:** weakest-first priority, turn-taking within ties, ID order, and skipping questions over the marks limit.

**Not done, because the data or an agreed policy doesn't exist:** topic, difficulty or Bloom-level balancing.

**Competency matching** accepts only LU, CU, AU and CT, ignoring case and surrounding spaces. Other spellings, such as "Language Understanding", are reported as unsupported, not guessed.

**Limitation:** the scores it reads are unverified. Some code paths set them from request input, fixed increments or simulated grading. Results are relative comparisons, not diagnosis.

## Planned, not implemented

- Learning gap analysis beyond relative ranking (needs assessment data)
- Pedagogical strategies
- Question selection by topic, difficulty and cognitive level (no such data or agreed policy yet; selection currently uses subject, school and competency)
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
