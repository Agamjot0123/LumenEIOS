"""Parent discovery: a parent lists linked children and their assignments (read-only).

  GET /api/v1/parents/me/students
  GET /api/v1/parents/me/students/{student_id}/homework/assignments

Reuses the synthetic `world` fixture from test_homework_evaluations: the parent is linked to
Alice only; Alice has submitted, Bob is in progress, Dan hasn't started.
"""
import pytest

from backend.tests.test_homework_evaluations import (  # noqa: F401 (fixture import)
    HIDDEN,
    RELEASE,
    as_parent,
    auth,
    bearer,
    marked_and_finalized,
    transition,
    world,
)

CHILDREN = "/api/v1/parents/me/students"
CHILD_ASSIGNMENTS = CHILDREN + "/{}/homework/assignments"


@pytest.mark.asyncio
async def test_parent_lists_only_linked_children(client, world):
    res = await client.get(CHILDREN, headers=as_parent(world))
    assert res.status_code == 200
    assert [c["id"] for c in res.json()] == [world["alice"]]
    assert set(res.json()[0]) == {"id", "name", "class_name", "school_id"}


@pytest.mark.asyncio
async def test_child_assignments_show_progress_and_release_without_content(client, world, teacher_token):
    res = await client.get(CHILD_ASSIGNMENTS.format(world["alice"]), headers=as_parent(world))
    assert res.status_code == 200
    rows = res.json()
    assert [r["id"] for r in rows] == [world["a_alice"]]
    assert rows[0]["submission_status"] == "submitted" and rows[0]["result_released"] is False
    for hidden in HIDDEN + ("items", "awarded", "feedback", "answer"):
        assert hidden not in res.text, hidden

    await marked_and_finalized(client, world, auth(teacher_token))
    assert (await transition(client, RELEASE, world, "a_alice", 3, auth(teacher_token))).status_code == 200
    rows = (await client.get(CHILD_ASSIGNMENTS.format(world["alice"]), headers=as_parent(world))).json()
    assert rows[0]["result_released"] is True


@pytest.mark.asyncio
async def test_unlinked_or_missing_child_gives_the_same_404(client, world):
    unlinked = await client.get(CHILD_ASSIGNMENTS.format(world["bob"]), headers=as_parent(world))
    missing = await client.get(CHILD_ASSIGNMENTS.format("no-such-student"), headers=as_parent(world))
    assert unlinked.status_code == missing.status_code == 404
    assert unlinked.json() == missing.json()


@pytest.mark.asyncio
async def test_non_parents_are_refused(client, world, teacher_token):
    for headers in (auth(teacher_token), bearer(world["u_alice"], "student")):
        assert (await client.get(CHILDREN, headers=headers)).status_code == 403
        assert (await client.get(CHILD_ASSIGNMENTS.format(world["alice"]), headers=headers)).status_code == 403
    assert (await client.get(CHILDREN)).status_code == 401
