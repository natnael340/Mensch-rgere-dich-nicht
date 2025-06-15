FROM python:3.11.5-slim
WORKDIR /app
COPY app/ ./app
COPY raft.yaml raft.yaml
COPY raft.proto raft.proto
COPY requirements.txt requirements.txt

RUN pip install -r requirements.txt

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
