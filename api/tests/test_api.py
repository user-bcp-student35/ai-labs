import base64
import time
from importlib.metadata import version
from pathlib import Path

import pytest
import urllib3
from fastapi.testclient import TestClient

from app.main import create_app

TEST_TOKEN_LIFETIME_SECONDS = 3600


def token(username: str = "student", role: str = "STUDENT") -> str:
    raw = (
        f"{username}|{role}|{int(time.time()) + TEST_TOKEN_LIFETIME_SECONDS}"
        "|WORKSHOP_SECRET_2026"
    )
    return base64.b64encode(raw.encode()).decode()


def headers(username: str = "student", role: str = "STUDENT") -> dict[str, str]:
    return {"Authorization": f"Bearer {token(username, role)}"}


def test_lists_seeded_tasks(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.get("/api/tasks", headers=headers())
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_creates_task_and_summary(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        created = client.post(
            "/api/tasks",
            headers=headers(),
            json={"title": "Add tests", "description": "Improve coverage", "status": "TODO", "priority": "HIGH"},
        )
        summary = client.get("/api/summary", headers=headers())
    assert created.status_code == 201
    assert created.json()["owner"] == "student"
    assert set(created.json()) == {
        "id",
        "title",
        "description",
        "status",
        "owner",
        "priority",
        "createdAt",
    }
    assert summary.json()["total"] == 3
    assert set(summary.json()) == {
        "owner",
        "total",
        "byStatus",
        "highPriorityOpen",
    }


def test_uploads_requirement(tmp_path: Path) -> None:
    upload_dir = tmp_path / "uploads"
    app = create_app(str(tmp_path / "workshop.db"), str(upload_dir))
    with TestClient(app) as client:
        response = client.post(
            "/api/requirements",
            headers=headers(),
            files={"file": ("requirements.txt", b"Login must be accessible", "text/plain")},
        )
    assert response.status_code == 201
    assert set(response.json()) == {"owner", "fileName", "storedAt", "size"}
    assert (upload_dir / "requirements.txt").exists()


def test_rejects_invalid_token(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.get("/api/tasks", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401


def test_owner_query_is_ignored_and_token_identity_is_used(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.get("/api/tasks?owner=trainer", headers=headers())
        summary_response = client.get("/api/summary?owner=trainer", headers=headers())

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert {task["owner"] for task in response.json()} == {"student"}
    assert summary_response.json()["owner"] == "student"
    assert summary_response.json()["total"] == 2


def test_create_task_uses_token_identity_instead_of_request_owner(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.post(
            "/api/tasks",
            headers=headers(),
            json={"title": "Trainer task", "description": "Review", "owner": "trainer"},
        )

    assert response.status_code == 201
    assert response.json()["owner"] == "student"


def test_task_title_with_apostrophe_round_trips(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.post(
            "/api/tasks",
            headers=headers(),
            json={"title": "Review student's work", "description": "Characterization"},
        )

    assert response.status_code == 201
    assert response.json()["title"] == "Review student's work"


def test_app_factory_and_import_entrypoint_are_available(tmp_path: Path) -> None:
    from app.main import app

    created_app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))

    assert app.title == "Workshop Requirements API"
    assert any(route.path == "/api/tasks" for route in created_app.routes)


def test_create_task_uses_existing_defaults(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.post(
            "/api/tasks",
            headers=headers(),
            json={"title": "Defaults", "description": "Characterization"},
        )

    assert response.status_code == 201
    assert response.json()["status"] == "TODO"
    assert response.json()["priority"] == "MEDIUM"


def test_summary_counts_statuses_and_high_priority_open_tasks(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        for status in ("DONE", "ARCHIVED", "TODO"):
            client.post(
                "/api/tasks",
                headers=headers(),
                json={
                    "title": f"High {status}",
                    "description": "Summary characterization",
                    "status": status,
                    "priority": "HIGH",
                },
            )
        response = client.get("/api/summary", headers=headers())

    summary = response.json()
    assert response.status_code == 200
    assert summary["total"] == 5
    assert summary["byStatus"] == {"TODO": 2, "IN_PROGRESS": 1, "DONE": 1, "ARCHIVED": 1}
    assert summary["highPriorityOpen"] == 2


def test_missing_task_body_returns_validation_error(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.post("/api/tasks", headers=headers())

    assert response.status_code == 422


def test_dependency_versions_after_update() -> None:
    assert version("urllib3") == "2.8.0"
    assert version("python-multipart") == "0.0.33"


def test_invalid_token_response_has_generic_detail(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.get("/api/tasks", headers={"Authorization": "Bearer invalid"})

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token"


def test_backend_health_rejects_invalid_token(tmp_path: Path) -> None:
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.get(
            "/api/backend-health",
            headers={"Authorization": "Bearer invalid"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid token"


def test_backend_health_response_has_generic_transport_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_request(*args: object, **kwargs: object) -> None:
        raise urllib3.exceptions.HTTPError("backend transport details")

    monkeypatch.setattr(urllib3.PoolManager, "request", fail_request)
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.get("/api/backend-health", headers=headers())

    assert response.status_code == 200
    assert response.json()["body"] == "Backend health check failed"


def test_backend_health_response_has_generic_error_for_invalid_utf8(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class HealthResponse:
        status = 200
        data = b"\xff"

    def return_response(*args: object, **kwargs: object) -> HealthResponse:
        return HealthResponse()

    monkeypatch.setattr(urllib3.PoolManager, "request", return_response)
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.get("/api/backend-health", headers=headers())

    assert response.status_code == 200
    assert response.json() == {
        "requestedBy": "student",
        "status": 0,
        "body": "Backend health check failed",
    }


def test_backend_health_success_preserves_response_shape(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class HealthResponse:
        status = 200
        data = b"healthy"

    def return_response(*args: object, **kwargs: object) -> HealthResponse:
        return HealthResponse()

    monkeypatch.setattr(urllib3.PoolManager, "request", return_response)
    app = create_app(str(tmp_path / "workshop.db"), str(tmp_path / "uploads"))
    with TestClient(app) as client:
        response = client.get("/api/backend-health", headers=headers())

    assert response.status_code == 200
    assert response.json() == {
        "requestedBy": "student",
        "status": 200,
        "body": "healthy",
    }
