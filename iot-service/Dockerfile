# iot-service (Grupo 1) — imagem para o GCP Cloud Run
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
RUN useradd -m appuser
USER appuser
# Cloud Run injeta a variável PORT
CMD exec uvicorn app:app --host 0.0.0.0 --port ${PORT} --workers 1
