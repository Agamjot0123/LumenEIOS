# Curriculum setup (full syllabus + default teacher plans)

**Source of truth (tracked):** `backend/app/seed/data/ncert_review_batch01_structure.json` - heading structure of the NCERT review batch:
76 chapters, 353 numbered sections (TOPIC), 102 numbered subheadings (SUBTOPIC), 8 textbooks, Classes VI-VIII Mathematics and Science, with PDF-page
locators. Headings only: no page text, outcomes or Core/Non-Core data. It is an **incomplete structural inventory, not a verified syllabus** (see
`NCERT_REVIEW_BATCH_01_INTEGRATION.md`). 415 leaf topics are teachable (65/65/65/78/58/84 for VI-Maths, VI-Sci, VII-Maths, VII-Sci, VIII-Maths, VIII-Sci).

## After cloning / pulling
```
cd apps/lumeneios
python -m venv venv && venv/Scripts/pip install -r backend/requirements.txt   # (Linux/macOS: venv/bin/...)
npm install
# optional, explicit (the backend also does this at startup when DEMO_MODE=true and AUTO_SEED_CURRICULUM is not false):
DATABASE_URL=sqlite+aiosqlite:///./lumeneios_dev.db venv/Scripts/python -m backend.scripts.init_curriculum
DATABASE_URL=sqlite+aiosqlite:///./lumeneios_dev.db DEMO_MODE=true venv/Scripts/python -m uvicorn backend.app.main:app --port 8000
VITE_API_URL=http://127.0.0.1:8000/api/v1 npm run dev
```
Use your own database file; `backend.scripts.init_curriculum` refuses the four protected acceptance databases.

## What initialisation does (additive, idempotent)
1. Adds the missing `plan_topics` (one per teachable topic) and appends the dataset to each school's planning workspace (never edits existing rows).
2. For every teacher who teaches Class VI-VIII Mathematics/Science (roster subject + grades, plus any plan the database already holds) fills the
   missing `teacher_topic_configs` + `teacher_topic_coverage` rows via `ensure_defaults`: equal-weight largest-remainder allocation of T = P - ceil(0.10 P)
   periods, then a deterministic Core / Mixed (2:1 Core:Non-Core) / Non-Core pattern that is a pure function of the topic key. `origin='demo_default'`.
3. Re-running changes nothing; teacher edits (`origin='teacher'`) and coverage are never overwritten.

These classifications are **planning defaults, not official NCERT classifications**. Teachers change them inline in Curriculum Catalogue (each topic row has
a Core / Core + Non-Core / Non-Core selector and a Done / In progress / Not done selector, saved against the selected teacher's plan).
Teachers who do not teach Mathematics/Science (English, Chemistry in the roster) have no plan; a Science teacher opening Time-Aware on Mathematics sees
"Not configured" because that combination is not theirs.
