# Flask To-Do List — DevOps Project

A containerized To-Do List web application built with Flask and MySQL, with automated CI using GitHub Actions and application monitoring using Prometheus and Grafana.

## Features

- Create and manage To-Do tasks through a Flask web application.
- Persist application data in MySQL.
- Package the application in Docker.
- Run the application and supporting services with Docker Compose.
- Run automated checks and build the Docker image with GitHub Actions.
- Expose application health and Prometheus metrics endpoints.
- Collect metrics with Prometheus and visualize them in Grafana.

## Tech Stack

- **Backend:** Python, Flask
- **Database:** MySQL 8.4
- **ORM / Database driver:** Flask-SQLAlchemy, PyMySQL
- **Containers:** Docker, Docker Compose
- **CI:** GitHub Actions
- **Monitoring:** Prometheus, Grafana
- **Metrics:** `prometheus-client`

## Architecture

```text
Browser
   |
   v
Flask To-Do App (:5000) --------> MySQL (:3306)
   |
   | /metrics
   v
Prometheus (:9090)
   |
   v
Grafana (:3000)
```

Docker Compose runs the app, database, Prometheus, and Grafana on a shared network. Prometheus scrapes the Flask `/metrics` endpoint every 15 seconds.

## Project Structure

The exact structure may vary slightly depending on your repository. The monitoring configuration paths below should match your `compose.yml`.

```text
to_do_list_devops/
├── app.py
├── requirements.txt
├── Dockerfile
├── compose.yml
├── .dockerignore
├── .gitignore
├── tests/
│   └── ...
├── monitoring/
│   ├── prometheus.yml
│   └── grafana/
│       └── provisioning/
│           └── datasources/
│               └── prometheus.yml
└── .github/
    └── workflows/
        └── ...
```

## Prerequisites

Install the following:

- [Git](https://git-scm.com/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Docker Compose
- A GitHub account, if you want to use the CI workflow

On Windows, open PowerShell in the project directory and ensure Docker Desktop is running.

## Run Locally with Docker Compose

### 1. Clone the repository

```bash
git clone https://github.com/Srushti-172006/to_do_list.git
cd to_do_list
```

If your working repository uses a different URL or folder name, use that repository's URL and directory instead.

### 2. Configure environment variables

The Compose file supports environment-variable overrides for database credentials and the Grafana admin password. For local development, you can create a `.env` file in the same directory as `compose.yml`:

```dotenv
MYSQL_DATABASE=todo_db
MYSQL_USER=todo_user
MYSQL_PASSWORD=change_this_database_password
MYSQL_ROOT_PASSWORD=change_this_root_password
GRAFANA_PASSWORD=change_this_grafana_password
```

Use strong, unique passwords. Do not commit `.env` or production secrets to Git. The default values in the Compose file are for local development only.

### 3. Build and start the services

```bash
docker compose up -d --build
```

Check the service status:

```bash
docker compose ps
```

View application logs:

```bash
docker compose logs --tail=100 app
```

View logs for all services:

```bash
docker compose logs --tail=100
```

### 4. Open the application and monitoring tools

| Service | URL | Purpose |
|---|---|---|
| Flask app | http://localhost:5000 | To-Do application |
| Health endpoint | http://localhost:5000/health | Application health check |
| Metrics endpoint | http://localhost:5000/metrics | Prometheus metrics |
| Prometheus | http://localhost:9090 | Query metrics and inspect targets |
| Prometheus targets | http://localhost:9090/targets | Confirm scrape status |
| Grafana | http://localhost:3000 | Dashboards and visualizations |

Grafana's username is configured as `admin` in the supplied Compose configuration. Use the password set by `GRAFANA_PASSWORD`, or the Compose-file default if you have not overridden it.

## Prometheus Configuration

Prometheus configuration is located at `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "todo-flask"
    metrics_path: /metrics
    static_configs:
      - targets: ["app:5000"]
```

The target `app:5000` uses the Docker Compose service name and is resolved from inside the Compose network. Do not replace it with `localhost:5000` in this configuration.

After starting the services, visit http://localhost:9090/targets. The `todo-flask` target should show **UP**.

## Grafana Setup

The Compose configuration provisions Prometheus as a Grafana data source using:

```text
http://prometheus:9090
```

This is the Prometheus service name and port on the internal Docker network.

1. Open http://localhost:3000 and sign in.
2. Open **Connections → Data sources** and select Prometheus.
3. Verify the URL is `http://prometheus:9090`.
4. Create a dashboard and add time-series panels using the queries below.

### Example PromQL Queries

**Request rate over the last five minutes**

```promql
rate(todo_http_requests_total[5m])
```

**Request counts by available labels**

```promql
sum by (method, endpoint, status) (todo_http_requests_total)
```

The label names depend on the labels actually defined in `app.py`; adjust the query to match the exported metric.

**Average request duration over five minutes**

```promql
rate(todo_http_request_duration_seconds_sum[5m])
/
rate(todo_http_request_duration_seconds_count[5m])
```

**95th percentile request duration**, if the histogram exports bucket series:

```promql
histogram_quantile(
  0.95,
  sum by (le) (rate(todo_http_request_duration_seconds_bucket[5m]))
)
```

If a panel has no data, visit the app and perform a few requests, then check the metric names at http://localhost:5000/metrics and try the query again.

## CI with GitHub Actions

The GitHub Actions workflow in `.github/workflows/` runs the repository's configured checks and builds the Docker image. Check the Actions tab in GitHub to review workflow results.

To run tests locally, use the test command configured in your workflow. A common example is:

```bash
python -m pytest
```

This command requires the test dependencies to be installed. Follow the repository's `requirements.txt` and test configuration.

## Useful Docker Commands

Start or rebuild services:

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

Follow app logs:

```bash
docker compose logs -f app
```

Restart the app:

```bash
docker compose restart app
```

Stop services without deleting persistent volumes:

```bash
docker compose down
```

**Warning:** `docker compose down -v` removes Compose-managed volumes and can delete the stored MySQL database and monitoring data. Use it only if you intentionally want to remove that data.

## Troubleshooting

### Prometheus target is DOWN

1. Check `docker compose ps` and confirm the app is running.
2. Inspect the app logs with `docker compose logs --tail=100 app`.
3. Confirm `monitoring/prometheus.yml` is a **file**, not a directory.
4. Confirm the scrape target is `app:5000`.
5. Check the endpoint at http://localhost:5000/metrics.
6. Refresh http://localhost:9090/targets.

### MySQL authentication error mentioning `cryptography`

Install the `cryptography` package in the Python environment used by the app and include it in `requirements.txt`, then rebuild:

```bash
docker compose up -d --build
```

### Port 5000 is already in use

Find the process or container using port 5000. If an older container from this project is using it, stop that container before starting the Compose app:

```bash
docker ps
docker stop <container_name_or_id>
docker compose up -d
```

Replace the placeholder with the actual container name or ID.

### Grafana cannot connect to Prometheus

Verify that both containers are running and the provisioned data source URL is `http://prometheus:9090`. This internal URL is intended for container-to-container communication.

## Security Notes

- Do not commit `.env` files, credentials, API keys, or other secrets.
- Change demo/default passwords before sharing the project or exposing services beyond your local machine.
- The sample Compose setup is intended for local development and demonstration, not as a hardened production deployment.
- Do not expose database ports publicly unless required and appropriately secured.

## Future Improvements

- Add a prebuilt Grafana dashboard and provision it automatically.
- Add alerting rules for high request latency or application downtime.
- Add code coverage and linting to CI.
- Add dependency and container image security scanning.
- Improve health checks and structured logging.
- Deploy to a cloud environment after adding production-grade secret management and security controls.

## Author

**Srushti Balsaraf**

GitHub: [Srushti-172006](https://github.com/Srushti-172006)
