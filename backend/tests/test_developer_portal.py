import pytest
from pydantic import SecretStr

from backend.app.core.config import settings


@pytest.mark.asyncio
async def test_developer_portal_requires_root_and_records_role_switches(client, teacher_token, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "DEMO_ROOT_PASSWORD", SecretStr("kvr-test"))
    teacher = {"Authorization": f"Bearer {teacher_token}"}
    assert (await client.get("/api/v1/developer/health", headers=teacher)).status_code == 403

    login = await client.post("/api/v1/auth/login", json={"email": "LEOFELIX", "password": "kvr-test"})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    assert (await client.get("/api/v1/developer/health", headers=headers)).status_code == 200
    assert (await client.get("/api/v1/developer/releases", headers=headers)).status_code == 200
    framework = await client.get("/api/v1/developer/framework", headers=headers)
    assert framework.status_code == 200
    assert any(item["code"] == "CU-6" for item in framework.json())

    updated = await client.put(
        "/api/v1/developer/flags",
        json={"school_id": "school-1", "flag_key": "question_studio", "enabled": False},
        headers=headers,
    )
    assert updated.status_code == 200
    active = await client.get("/api/v1/developer/flags/active", headers=teacher)
    assert active.json()["question_studio"] is False
    await client.put(
        "/api/v1/developer/flags",
        json={"school_id": "school-1", "flag_key": "question_studio", "enabled": True},
        headers=headers,
    )

    workshop = await client.post(
        "/api/v1/developer/workshop",
        json={"kind": "question", "text": "Fractions of a whole", "competency_code": "CU-6"},
        headers=headers,
    )
    assert workshop.status_code == 200
    assert workshop.json()["result"]["competency"] == "CU-6"

    switched = await client.post("/api/v1/auth/demo-root/role", json={"role": "teacher"}, headers=headers)
    assert switched.status_code == 200
    developer = await client.post(
        "/api/v1/auth/demo-root/role",
        json={"role": "developer"},
        headers={"Authorization": f"Bearer {switched.json()['access_token']}"},
    )
    log = await client.get(
        "/api/v1/developer/access",
        headers={"Authorization": f"Bearer {developer.json()['access_token']}"},
    )
    assert log.status_code == 200
    assert any(item["to_role"] == "teacher" and item["from_role"] == "developer" for item in log.json())
    assert (await client.post("/api/v1/developer/roster/reseed", json={"confirm": "no"}, headers=headers)).status_code == 400
