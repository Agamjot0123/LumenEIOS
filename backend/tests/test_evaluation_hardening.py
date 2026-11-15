"""Deterministic checks applied to every scan-evaluator result (MCQ key match, blanks, copied template text)."""
from backend.app.schemas.evaluation import EvaluationResult
from backend.app.services.evaluation_service import harden_evaluation, mcq_choice_is_key, split_numbered_answers

QUESTIONS = [
    {"id": "1", "max_marks": 1, "competency": "LU", "options": ["burning of paper", "melting of ice", "tearing of paper", "dissolving sugar"],
     "correct_answer": "burning of paper"},
    {"id": "2", "max_marks": 2, "competency": "CU", "options": [], "correct_answer": "No new substance forms in a physical change."},
    {"id": "3", "max_marks": 2, "competency": "AU", "options": [], "correct_answer": "Chemical."},
]


def model_output(**overrides):
    items = [
        {"question_index": 1, "question_id": "1", "question_text": "q1", "competency": "LU", "max_marks": 1,
         "awarded_marks": 1, "competency_score": 100, "feedback": "Correct volume and liter conversion; final calculation step for time was omitted."},
        {"question_index": 2, "question_id": "2", "question_text": "q2", "competency": "CU", "max_marks": 2,
         "awarded_marks": 2, "competency_score": 100, "feedback": "Clear explanation."},
        {"question_index": 3, "question_id": "3", "question_text": "q3", "competency": "AU", "max_marks": 2,
         "awarded_marks": 2, "competency_score": 100, "feedback": "Good."},
    ]
    return EvaluationResult.model_validate({
        "question_evaluations": items,
        "scoring_summary": {"total_marks_obtained": 5, "max_possible_marks": 5, "percentage": 100,
                            "overall_feedback": "Strong conceptual and formula grasp. Needs focus on complete multi-step problem execution."},
        **overrides,
    })


def test_split_numbered_answers_handles_common_labels_and_continuations():
    text = "Q1. dissolving sugar\nQ2. In a physical change no new\nsubstance forms\nAns 3: chemical"
    assert split_numbered_answers(text) == {1: "dissolving sugar", 2: "In a physical change no new substance forms", 3: "chemical"}


def test_wrong_mcq_choice_gets_zero_whatever_the_model_said():
    result = harden_evaluation(model_output(), QUESTIONS, "Q1. dissolving sugar\nQ2. no new substance\nQ3. chemical")
    q1 = result.question_evaluations[0]
    assert q1.awarded_marks == 0 and "burning of paper" in q1.feedback
    assert result.scoring_summary.total_marks_obtained == 4
    assert result.scoring_summary.competency_scores.LU == 0


def test_right_mcq_choice_and_option_letter_are_recognised():
    assert mcq_choice_is_key("burning of paper", QUESTIONS[0]["options"], "burning of paper") is True
    assert mcq_choice_is_key("(a)", QUESTIONS[0]["options"], "burning of paper") is True
    assert mcq_choice_is_key("b", QUESTIONS[0]["options"], "burning of paper") is False
    assert mcq_choice_is_key("I think something", QUESTIONS[0]["options"], "burning of paper") is None


def test_blank_answers_are_unattempted_and_template_text_is_removed():
    result = harden_evaluation(model_output(), QUESTIONS, "Q1. burning of paper\nQ2. no new substance forms")
    q3 = result.question_evaluations[2]
    assert q3.status == "unattempted" and q3.awarded_marks == 0
    assert result.scoring_summary.overall_feedback == ""
    assert all("liter conversion" not in i.feedback for i in result.question_evaluations)
    assert result.scoring_summary.total_marks_obtained == 3
