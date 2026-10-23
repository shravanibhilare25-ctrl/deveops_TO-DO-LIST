import pytest
from app import create_app, db

@pytest.fixture()
def client():
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite://",
        "AUTO_CREATE_TABLES": True,
    })
    with app.test_client() as client:
        yield client
    with app.app_context():
        db.session.remove()
        db.drop_all()

def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json["status"] == "ok"

def test_create_and_list_task(client):
    response = client.post("/api/tasks", json={"title": "Finish assignment", "priority": "high"})
    assert response.status_code == 201
    task_id = response.json["id"]
    assert response.json["title"] == "Finish assignment"
    listing = client.get("/api/tasks")
    assert listing.status_code == 200
    assert any(task["id"] == task_id for task in listing.json)

def test_title_required(client):
    response = client.post("/api/tasks", json={"title": "   "})
    assert response.status_code == 400

def test_update_and_delete_task(client):
    created = client.post("/api/tasks", json={"title": "Test task"})
    task_id = created.json["id"]
    updated = client.patch(f"/api/tasks/{task_id}", json={"completed": True})
    assert updated.status_code == 200
    assert updated.json["completed"] is True
    deleted = client.delete(f"/api/tasks/{task_id}")
    assert deleted.status_code == 200
    assert client.get(f"/api/tasks/{task_id}").status_code == 404

def test_metrics_endpoint(client):
    response = client.get("/metrics")
    assert response.status_code == 200
    assert b"todo_http_requests_total" in response.data
