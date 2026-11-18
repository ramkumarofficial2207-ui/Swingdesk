FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY python_ml/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY python_ml/ ./

EXPOSE 8000
CMD ["sh", "-c", "uvicorn service:app --host 0.0.0.0 --port ${PORT:-8000}"]
