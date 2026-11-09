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

| **Homework Assembler** (service only; no endpoint, nothing saved) | `homework_assembler.py`, `schemas.py` | `assemble_homework_draft(analysis, selection, request)` builds an unsaved `HomeworkDraft` for teacher review. Pure logic; raises `AssemblyError` on inconsistent input |

| **Homework preview endpoint** | `router.py`, `access.py` | `POST /students/{student_id}/homework/preview` runs the whole pipeline for one student and returns the `HomeworkDraft`. **Nothing is saved** |

Tests: `backend/tests/test_homework_gap_analyzer.py`, `test_homework_gap_analysis_api.py`, `test_homework_question_selection.py`, `test_homework_assembly.py`, `test_homework_preview_api.py`.

### Homework preview endpoint

`POST /api/v1/students/{student_id}/homework/preview`

**Request body (`HomeworkPreviewRequest`; unknown fields rejected):**

| Field | Rule |
|---|---|
| `subject_id` | Required, non-empty |
| `max_questions` | Required integer, at least 1 |
| `max_total_marks` | Optional integer, at least 1 |
| `include_ai_generated` | Required, a real `true` or `false` |

**No `school_id`:** the school comes from the student's record, and sending one gives 422.

**Order of checks:**
1. **Role:** must be admin, principal or teacher, otherwise 403 before any lookup. Parents and students are refused; parents can still view the gap analysis.
2. **Student:** must exist, otherwise 404.
3. **Access:** the same rule as the gap analysis endpoint (`can_view_student`): admin any school; teachers and principals their own school or an active membership. Otherwise 403.
4. **Subject:** must exist in `subjects`, otherwise 404, **and** be in the student's class `subject_ids_json`, otherwise 422 (agreed rule). A missing or inconsistent class record gives 500.
5. **Scores:** invalid stored scores give a 500 with a safe message.
6. **Pipeline:** gap analysis, then questions from the student's school and the requested subject, then selection, then assembly.
7. **Result:** 200 with the `HomeworkDraft`. Malformed question rows are skipped, and a note gives the count.

An `AssemblyError` here would mean the pipeline produced inconsistent data, so it returns a generic 500.

### How homework assembly works

Flow: gap analysis, then question selection, then **assembly**, then teacher review (not built yet).

1. **Check consistency.** All three inputs must agree:
   - **Same student:** the selection and the analysis refer to the same student.
   - **Same request:** the request's question count and marks limit match the selection's.
   - **Valid gap analysis:** it ranks LU, CU, AU and CT exactly once each, and its lowest, highest, spread, weakest and every rank agree with its own scores. The rationale copies these fields, so a contradiction is rejected.
   - **AI rule respected:** no AI-generated question appears unless the request allows them.
   - **Ranks agree:** each question's competency rank matches the analysis.
   - **Valid questions:** no question appears twice, and every question has marks of at least 1.
   - **Totals add up:** total marks, shortfall and question count are consistent, and the marks limit isn't exceeded.

   Any problem raises `AssemblyError`; nothing is silently corrected.
2. **Copy questions** in selection order into numbered `DraftItem`s (position 1, 2, ...). Text, marks, competency, rank, type, Bloom level and the AI flag are kept as they are.
3. **Recalculate** the question count and total marks from the items.
4. **Rationale** comes from the gap analysis only: targeted competencies, weakest, all four scores, lowest and highest, score source, and a factual summary such as `Targets LU (40), CT (50). Student's lowest score: LU (40); score range 40-70.` No teaching advice is added.
5. **Notes:** gap-analysis notes, then selection notes, then assembly notes (empty draft, incomplete draft, AI questions included).

**Output `HomeworkDraft`:**
- `student_id`, `school_id`, `subject_id`
- `items`, `question_count`, `total_marks`
- `requested_questions`, `max_total_marks`, `shortfall`, `is_complete`
- `contains_ai_generated`, `rationale`, `notes`

There are no answers, rubrics or options.

**Deliberately not included:** title, due date, assigning teacher, review status, or any saved record.

**Trusted upstream assumptions** (current schemas can't verify them):
- **School and subject:** `SelectionResult` and `SelectedQuestion` don't carry them, so the draft copies them from the request. They're correct when the request passed to the assembler is the same one given to the selector, which filters by it.
  - **Smallest change if independent checking becomes necessary** (proposal, not implemented): the selector copies `school_id`, `subject_id` and `include_ai_generated` from the request into `SelectionResult`, and the assembler checks they match. Checking each question would also need `school_id` and `subject_id` on `SelectedQuestion`.
- **Competency label within a tie:** if a question is relabelled to another competency with the same rank, that can't be detected, because `SelectedQuestion` is the only source of the label.

### Saving drafts (not supported; needs team approval)

`HomeworkRemediation` **can't safely store a draft**:
- **No question links:** there's nowhere to store the questions except as text in `description`.
- **Required fields with no agreed values:** `title`, `due_date` and `description` must be filled in.
- **One competency only:** `competency_target` holds a single value, but a draft can target several.
- **Drafts would leak to students:** `status` is free text, and both list routes (`GET /classes/{class_id}/homework`, `GET /students/{student_id}/homework`) return every row with no status filter. A draft would appear to students straight away, and "draft" would be an invented status anyway.

**Smallest suitable model (proposal only, not implemented):**

| Table | Fields |
|---|---|
| `homework_drafts` | `id`, `student_id` (FK), `school_id`, `subject_id`, `created_by` (user), `status`, `requested_questions`, `max_total_marks`, `rationale` (JSON), `score_source`, `created_at`, `reviewed_by`, `reviewed_at`, and a nullable `homework_remediation_id` set on approval |
| `homework_draft_items` | `draft_id` (FK), `position`, `question_id`, a snapshot of `text`, `marks`, `competency`, `bloom_level` and `type` at assembly time (because bank questions can be edited later), plus unique (`draft_id`, `position`) and unique (`draft_id`, `question_id`) |

**Needs team approval:**
- review statuses and who may change them
- teacher ownership
- whether items keep a snapshot of the question or just reference it
- how drafts become assignments, and how the existing list routes exclude drafts
- retention
- how migrations are run (Alembic is in `requirements.txt` but not set up)

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
| `GET /students/{student_id}/homework/gap-analysis` | admin; principal or teacher (school or active membership); linked parent | Works; read-only |
| `POST /students/{student_id}/homework/preview` | admin; principal or teacher (school or active membership) | Works; saves nothing |

## Integration with other modules

See [the API contract](../../../../../../docs/api-contracts/differentiated-homework.md). **Those interfaces are proposed and haven't been agreed with the owning teammates.**
