# LumenEIOS demonstration walkthrough

A fictional CBSE school network for presenting LumenEIOS end to end. Every person, school and score in it is
made up. Screenshots of each step are in [`docs/screenshots/`](screenshots/).

## 1. Start, stop, reset

| | Windows | Linux / WSL |
|---|---|---|
| Start backend + frontend | `start-lumeneios.bat` | `./start-lumeneios.sh` |
| Stop everything | `stop-lumeneios.bat` | `./stop-lumeneios.sh` |

Open <http://localhost:3000>. The backend runs on port 8000.

Reset the demo data to its starting state (the current database is backed up first):

```bash
cd apps/lumeneios
.venv/bin/python -m backend.scripts.build_demo_database --fresh
```

This also rewrites [`LOGIN_CREDENTIALS.md`](LOGIN_CREDENTIALS.md), which lists every account.

## 2. The data

* **Shiksha Bharati Education Society** runs two schools, each with Classes 6, 7 and 8 (sections A and B, 20 students each):
  * **Sunrise Public School**, Bengaluru: Principal Dr. Lakshmi Narayanan.
  * **Himalayan Vidya Niketan**, Mandi: Principal Mr. Rajesh Thakur. It starts a little lower and lost more days to monsoon closures.
* Session 2026-27 began in April. These assessments are graded: Baseline (15 Apr), Class Test 1 (20 May), Periodic Test 1 (24 Jul),
  a handwritten Written Assignment (28 Aug), Half-Yearly (25 Sep) and Class Test 2 (30 Oct). Each one updated the students'
  four parameters: Language (LU), Concept (CU), Application (AU) and Critical Thinking (CT).
* Open work: Maths and Science worksheets due 20 Nov (handwritten, uploaded in Upload Beta). Periodic Test 2 is still a draft.

### Sign-in

The sign-in page has one-click buttons for the five featured accounts. Under *Developer mode* you can open any account without a password.

| Role | Account | Username | Password |
|---|---|---|---|
| Management | Ms. Ananya Rao | `ADMIN` | `Admin@123` |
| Principal | Dr. Lakshmi Narayanan | `SPS-PRINCIPAL` | `Principal@123` |
| Science teacher, class teacher 7-A | Ms. Garima Sharma | `garima.sharma@sps.lumeneios.demo` | `Teacher@123` |
| Maths teacher, 7-A | Mrs. Meera Krishnan | `SPS-T01` | `Teacher@123` |
| Student, 7-A | Gurleen Kaur | `SPS25047` | `14022013` (date of birth) |
| Parent | Harpreet Kaur | `9701577369` | `Parent@123` |

## 3. Live demo: from a handwritten sheet to every dashboard

Sample photographed answer sheets for 7-A are in [`demo/answer-sheets/`](../demo/answer-sheets/). Regenerate them with
`python -m backend.scripts.make_sample_answer_sheets`.

1. **Student uploads.** Sign in as Gurleen, then open **Upload Beta** and choose *Worksheet: Changes Around Us*.
   Upload `gurleen_7-a_science_worksheet.png` and click **Run OCR**. Qwen transcribes the handwriting
   (screenshots 35 and 36).
2. **Teacher evaluates.** Sign in as Ms. Garima, then open **Upload Beta** and the same worksheet. The class list shows who
   has uploaded. Pick Gurleen and click **Evaluate with AI**. The draft gives marks per question, checked against the
   answer key. Partly correct answers are flagged and shown with the missing part. Adjust if needed, then
   **Publish grade** (screenshots 19, 23 and 24).
3. **Parameters move.** Publishing records the result, updates Gurleen's LU/CU/AU/CT (the before and after values
   are shown) and notifies Gurleen and her parents.
4. **Everyone sees it.**
   * Student dashboard (30): the work shows as *Graded*, plus a new report-card column, parameters against the April baseline and the class average, the progress chart and the teacher's feedback.
   * Parent dashboard (40): the *New result* notification, the same report and activities to help at home.
   * Teacher dashboard (10): class KPIs, the results table and students needing support.
   * Principal (50 to 56) and Management (60 to 63): school and section comparisons, results by class and subject, teacher allocation, lost days and the audit trail.

For Maths, sign in as Mrs. Meera Krishnan (`SPS-T01`) and use `*_maths_worksheet.png`.

### Differentiated Homework

As Ms. Garima, open **Differentiated Homework**. Choose 7-A, Science and a student (for example Mahika Sharma,
weakest in Language). Preview builds homework from the question bank aimed at the student's weakest parameter.
Approve and assign it, and the student answers in **Differentiated Homework**. Marking and releasing the result
updates the parameters and notifies the parent (screenshots 17, 32 and 41).

### AI Question Studio Beta

Upload a chapter PDF or pick a question-bank topic, set the Bloom's levels, generate questions, then assign the paper
to a class (screenshot 16).

## 4. Other screens

| Screen | Screenshot |
|---|---|
| My Classes and competency heatmap | 11 |
| Time-Aware Engine (calendar, periods, lost days) | 13 |
| Curriculum Catalogue / Knowledge Components | 14, 15 |
| LearnSphere | 20 |
| Unified Student Progress (teacher, student, parent views) | 21, 31, 42 |
| Dark theme | 34, 57 |

**Daily Curriculum** (12) stays empty until a teacher generates a teaching schedule in the Time-Aware Engine and a
principal approves it. That is a step you can do live during the demo.

## 5. Notes

* Qwen OCR needs the GPU build (`backend/requirements-ocr.txt`). Images are read at up to about 1 megapixel. If the
  model ever returns unreadable output, it retries once at a lower resolution, and Gemini is available as a fallback.
* The AI evaluation is a draft for the teacher. Nothing reaches a student or parent until the teacher publishes it.
