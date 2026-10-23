
import os
import time
from datetime import datetime, date

from flask import Flask, jsonify, request, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from prometheus_client import (
    Counter,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST,
)
from sqlalchemy import text
from werkzeug.exceptions import HTTPException

db = SQLAlchemy()


# Define the model once, outside create_app().
class Task(db.Model):
    __tablename__ = "task"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(160), nullable=False)
    description = db.Column(
        db.String(600), nullable=False, default=""
    )
    completed = db.Column(
        db.Boolean, nullable=False, default=False
    )
    priority = db.Column(
        db.String(10), nullable=False, default="medium"
    )
    category = db.Column(
        db.String(80), nullable=False, default="Personal"
    )
    due_date = db.Column(db.Date, nullable=True)
    favorite = db.Column(
        db.Boolean, nullable=False, default=False
    )
    created_at = db.Column(
        db.DateTime, nullable=False, default=datetime.utcnow
    )

    def as_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "completed": self.completed,
            "priority": self.priority,
            "category": self.category,
            "dueDate": (
                self.due_date.isoformat()
                if self.due_date else ""
            ),
            "favorite": self.favorite,
            "createdAt": self.created_at.isoformat() + "Z",
        }


REQUEST_COUNT = Counter(
    "todo_http_requests_total",
    "HTTP requests",
    ["method", "endpoint", "status"],
)

REQUEST_LATENCY = Histogram(
    "todo_http_request_duration_seconds",
    "HTTP request duration",
    ["endpoint"],
)


def create_app(test_config=None):
    app = Flask(
        __name__,
        static_folder="Fronted",
        static_url_path="/static",
    )

    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL",
        "sqlite:///todo_dev.db",
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    if test_config:
        app.config.update(test_config)

    db.init_app(app)

    # Preserve compatibility with existing tests.
    app.Task = Task

    with app.app_context():
        if app.config.get("AUTO_CREATE_TABLES", True):
            db.create_all()

    @app.before_request
    def start_timer():
        request._started_at = time.perf_counter()

    @app.after_request
    def record_metrics(response):
        endpoint = request.endpoint or "unknown"

        REQUEST_COUNT.labels(
            request.method,
            endpoint,
            str(response.status_code),
        ).inc()

        elapsed = time.perf_counter() - getattr(
            request, "_started_at", time.perf_counter()
        )
        REQUEST_LATENCY.labels(endpoint).observe(elapsed)

        return response

    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/health")
    def health():
        try:
            db.session.execute(text("SELECT 1"))
            return jsonify(
                status="ok",
                database="connected",
            ), 200
        except Exception:
            db.session.rollback()
            return jsonify(
                status="error",
                database="unavailable",
            ), 503

    @app.get("/metrics")
    def metrics():
        return (
            generate_latest(),
            200,
            {"Content-Type": CONTENT_TYPE_LATEST},
        )

    @app.get("/api/tasks")
    def list_tasks():
        tasks = Task.query.order_by(Task.created_at.desc()).all()
        return jsonify([task.as_dict() for task in tasks])

    @app.post("/api/tasks")
    def create_task():
        data = request.get_json(silent=True) or {}
        title = str(data.get("title", "")).strip()

        if not title:
            return jsonify(error="title is required"), 400

        if len(title) > 160:
            return jsonify(
                error="title must be 160 characters or fewer"
            ), 400

        priority = data.get("priority", "medium")
        if priority not in ("low", "medium", "high"):
            return jsonify(
                error="priority must be low, medium, or high"
            ), 400

        due_value = data.get("dueDate") or None

        try:
            due_date = (
                date.fromisoformat(due_value)
                if due_value else None
            )
        except (TypeError, ValueError):
            return jsonify(
                error="dueDate must use YYYY-MM-DD format"
            ), 400

        task = Task(
            title=title,
            description=str(data.get("description", ""))[:600],
            completed=bool(data.get("completed", False)),
            priority=priority,
            category=(
                str(data.get("category", "Personal"))[:80]
                or "Personal"
            ),
            due_date=due_date,
            favorite=bool(data.get("favorite", False)),
        )

        db.session.add(task)
        db.session.commit()

        return jsonify(task.as_dict()), 201

    @app.get("/api/tasks/<int:task_id>")
    def get_task(task_id):
        task = db.session.get(Task, task_id)

        if not task:
            return jsonify(error="task not found"), 404

        return jsonify(task.as_dict())

    @app.patch("/api/tasks/<int:task_id>")
    def update_task(task_id):
        task = db.session.get(Task, task_id)

        if not task:
            return jsonify(error="task not found"), 404

        data = request.get_json(silent=True) or {}

        if "title" in data:
            title = str(data["title"]).strip()

            if not title or len(title) > 160:
                return jsonify(
                    error="title must be 1–160 characters"
                ), 400

            task.title = title

        if "description" in data:
            task.description = str(data["description"])[:600]

        if "completed" in data:
            task.completed = bool(data["completed"])

        if "favorite" in data:
            task.favorite = bool(data["favorite"])

        if "category" in data:
            task.category = (
                str(data["category"])[:80] or "Personal"
            )

        if "priority" in data:
            if data["priority"] not in ("low", "medium", "high"):
                return jsonify(error="invalid priority"), 400

            task.priority = data["priority"]

        if "dueDate" in data:
            try:
                task.due_date = (
                    date.fromisoformat(data["dueDate"])
                    if data["dueDate"] else None
                )
            except (TypeError, ValueError):
                return jsonify(
                    error="dueDate must use YYYY-MM-DD format"
                ), 400

        db.session.commit()
        return jsonify(task.as_dict())

    @app.delete("/api/tasks/<int:task_id>")
    def delete_task(task_id):
        task = db.session.get(Task, task_id)

        if not task:
            return jsonify(error="task not found"), 404

        db.session.delete(task)
        db.session.commit()

        return jsonify(message="task deleted")

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        return jsonify(error=error.description), error.code

    return app


# Create the application.
app = create_app()

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=False,
    )
