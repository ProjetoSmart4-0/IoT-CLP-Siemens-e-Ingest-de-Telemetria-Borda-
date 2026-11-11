FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir "asyncua>=1.1"
COPY mock_plc.py .
EXPOSE 4840
CMD ["python", "mock_plc.py"]
