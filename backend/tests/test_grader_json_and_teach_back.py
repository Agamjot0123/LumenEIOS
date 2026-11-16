"""Qwen graders: fenced JSON is accepted; Teach-Back feedback does not contradict the rubric."""
from backend.app.modules.learnsphere.schemas import TeachBackFeedback
from backend.app.schemas.assessment_learning import WrittenMark
from backend.app.services.llm_service import json_object_text, sanity_check_teach_back

RUBRIC = "Plants use sunlight, water and carbon dioxide to make glucose (food) and release oxygen; happens in chlorophyll-containing leaves."


def test_fenced_json_is_accepted():
    raw = '```json\n{"score": 2, "correct": true, "explanation": "Both parts.", "feedback": "Well explained."}\n```'
    assert WrittenMark.model_validate_json(json_object_text(raw)).score == 2
    assert json_object_text('Here you go: {"a": 1} thanks') == '{"a": 1}'


def test_true_statements_are_not_misconceptions_and_written_concepts_are_not_missing():
    response = ("Plants make their own food in their green leaves. Chlorophyll traps sunlight and the plant uses water "
                "and carbon dioxide to make glucose, and gives out oxygen.")
    fb = TeachBackFeedback(correctly_understood=[], missing_concepts=["chlorophyll"],
                           misconceptions=["Plants make their own food in their green leaves.", "Plants eat soil to get food."],
                           strengths=[], next_step="Keep going.")
    fb = sanity_check_teach_back(fb, RUBRIC, response)
    assert fb.misconceptions == ["Plants eat soil to get food."]
    assert "Plants make their own food in their green leaves." in fb.correctly_understood
    assert fb.missing_concepts == []


def test_partial_explanation_gets_the_uncovered_rubric_points_as_missing():
    fb = TeachBackFeedback(correctly_understood=["Plants use sunlight to make food"], missing_concepts=[], misconceptions=[],
                           strengths=[], next_step="Add more detail.")
    fb = sanity_check_teach_back(fb, RUBRIC, "Plants use sunlight to make food.")
    text = " ".join(fb.missing_concepts)
    assert "water" in text and "oxygen" in text and "chlorophyll" in text
    assert not any("sunlight" == m for m in fb.missing_concepts)


def test_teach_back_lists_come_from_per_point_judgements_and_cannot_contradict():
    from backend.app.services.llm_service import rubric_points, teach_back_feedback
    rubric = ("Land heats up faster than water; warm air over the land rises; cooler air from over the sea moves in "
              "to take its place; at night the direction reverses (land breeze).")
    response = ("In the day the land gets hot faster than the sea water. The hot air over the land rises. Cooler air "
                "from the sea comes in. At night the wind blows from land to sea.")
    points = rubric_points(rubric)
    assert len(points) == 4
    data = {"covered": [True, True, True, True],
            "misconceptions": ["The student incorrectly stated that the wind blows from land to sea at night.",
                               "Plants eat soil"],
            "strengths": [], "next_step": ""}
    fb = teach_back_feedback(points, data["covered"], data, response, rubric, TeachBackFeedback)
    assert fb.missing_concepts == [] and len(fb.correctly_understood) == 4
    assert fb.misconceptions == []   # restates the rubric / was never written by the student
    assert not set(fb.correctly_understood) & set(fb.missing_concepts)
