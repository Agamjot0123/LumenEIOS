# Arena port notes

- Reuses existing `apps/lumeneios/backend/app/services/ai_gateway.py` (not replaced).
- Uses Unified Student Progress evidence/explanations for grounding.
- Assignment creates legacy `HomeworkRemediation` rows (still supported by Arena DH router).
- Access control reuses Differentiated Homework-linked `student_progress.access`.
