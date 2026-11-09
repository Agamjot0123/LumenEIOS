# Curriculum Catalogue: Frontend Prototype Notes

Owner: Claude (frontend). The backend API contract is owned by Codex and will live at
`apps/lumeneios/docs/CURRICULUM_API_INTEGRATION_CONTRACT.md`. **That file did not exist when this was written.**
This document records the frontend's expectations. It is not a competing API definition.

## Integration status: MOCK-BACKED

The UI is **not** connected to a live curriculum API. By default it reads a metadata-only research snapshot
(`src/features/curriculum/mocks/researchSnapshot.json`). That snapshot was generated from Codex's NCERT Phase 0 research CSVs:

| Fixture section | Source CSV (Codex-owned, `apps/lumeneios/docs/`) |
|---|---|
| `coverage` (130 rows) | `NCERT_VI_VIII_COVERAGE_MATRIX.csv` |
| `editions` (24 rows) | `NCERT_VI_VIII_TEXTBOOK_EDITIONS.csv` |
| `crosswalk` (10 rows) | `NCERT_VI_VIII_CHAPTER_TOPIC_OUTCOME_CROSSWALK.csv` |

The fixture records the SHA-256 of each CSV. To regenerate it:
`npm run build:curriculum-fixtures -- <path-to-apps/lumeneios/docs>`.
The script refuses to build if any crosswalk row claims stored outcome wording.

The snapshot contains no textbook paragraphs, exercises or learning-outcome wording. It holds only titles, editions, official URLs, locators and verification codes.

## Data source switch

| `VITE_CURRICULUM_DATA_SOURCE` | Behaviour |
|---|---|
| unset / `mock` (default) | Research snapshot. Simulated latency, 403 and 422 responses. Review decisions are kept in memory for the browser session. |
| `api` | Calls `GET {VITE_API_URL}/ncert/releases`. Every other view shows a "Backend API not available yet" state. |

The mock data is loaded with a dynamic `import()`, so it ships as a separate chunk and is never fetched in API mode.

## Endpoints used in API mode

Only the paths named in `NCERT_DATABASE_INTEGRATION.md` (contract v1) appear in `src/features/curriculum/api/endpoints.ts`:
`/ncert/releases`, `/ncert/releases/{id}/hierarchy`, `/ncert/nodes/{id}/outcomes|relationships|citations`.
None of them are implemented in the backend yet.

## Capabilities the UI needs that the contract does not define (blockers)

1. **Resource availability per class, subject and language.** The UI needs framework, syllabus (current and 2006), learning-outcome documents (current and 2017) and textbook language editions or parts, each with a verification status, locator, rights status and unresolved notes. The v1 contract only exposes the node hierarchy.
2. **Class/subject to subject-node lookup.** The hierarchy endpoint needs `subject_identity_id`, and the frontend has no way to resolve it.
3. **Listing candidate (AI-suggested) mappings.** The contract mentions "suggestion access explicit and authorized" for `verified_only=false`, but that requires per-node calls with no list endpoint for a class or subject.
4. **Recording a review decision.** No endpoint exists. `CatalogueReview` stores `decision` from the *verification* enum (`SOURCE_VERIFIED|EXPERT_VERIFIED|AI_SUGGESTED|AWAITING_REVIEW|REJECTED`). The UI offers Approve, Reject and Request revision. Codex needs to confirm how these map: Approve to `EXPERT_VERIFIED`? Request revision to `AWAITING_REVIEW`?
5. **Dashboard counts and pending-review totals.** These are computed client-side in mock mode only. In API mode they should come from the backend, so the frontend does not duplicate backend calculations.

## Ownership conflict to resolve

`NCERT_DATABASE_INTEGRATION.md` says "New **Claude-owned** /api/v1/ncert …" and "Claude owns … HTTP APIs/frontend".
The current task brief instead assigns the backend API to Codex. No backend code was written from the frontend
worktree. Codex and the team lead need to agree on who implements the `/ncert` HTTP layer.

## Frontend status vocabulary

Raw codes map to display statuses through an explicit table in `src/features/curriculum/status.ts`. Unknown codes become
**UNVERIFIED**, never VERIFIED. Every badge shows an icon and a text label, so status never depends on colour alone.

## Permissions (UI gating only)

`VIEW_CURRICULUM_CATALOGUE`: admin, principal, teacher. `REVIEW_CURRICULUM_MAPPINGS`: admin, principal.
These checks only show or hide UI. The backend must enforce authorization. The UI already renders backend 401 and 403 responses as an
unauthorized state, and shows a 403 on a review submission inside the decision dialog.

## Demonstration script

1. `cd apps/lumeneios && npm install && npm run dev`, then open http://localhost:3000/curriculum/catalogue
   (sidebar: **Curriculum Catalogue**, visible to Admin, Principal and Teacher).
2. Dashboard: point out the scope pill, the violet "mock" data-source banner, and the six combination cards with verified, partial, unverified and placeholder counts.
3. Pick **Class VII · Mathematics**, then **Open**. The Overview shows the language matrix, syllabus placeholders ("No syllabus found in checked NCERT channels"), the 2017 outcomes document, and the textbook editions including the **Urdu Part II gap**.
4. Click any **Evidence** button to open the source panel with the official URL, edition, locator, raw status code and open issues.
5. **Chapters & topics** (Class VI Maths): only Chapter 4, section 4.3 is listed. The notice explains that no chapters are inferred. Pick the Hindi edition to show the empty state.
6. **Mapping review** as Admin or Principal: the dashed amber card reads "AI-suggested candidate. Not approved." Click **Request revision**, try submitting with no rationale (it is blocked), add a rationale and submit. The status changes to "Revision requested" with a history entry.
7. Switch persona to **Teacher**: review buttons are replaced with "View only". Switch to **Student**: the catalogue is unauthorized.
