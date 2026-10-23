
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirement.txt .
RUN pip install --no-cache-dir -r requirement.txt

COPY app.py .
COPY Fronted/ ./Fronted/

EXPOSE 5000

CMD ["python", "app.py"]
