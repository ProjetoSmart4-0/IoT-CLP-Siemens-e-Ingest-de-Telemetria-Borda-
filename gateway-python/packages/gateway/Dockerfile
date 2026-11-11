# Build a partir da RAIZ do monorepo (o schema é compartilhado):
#   docker build -f packages/gateway/Dockerfile .
FROM python:3.12-slim
WORKDIR /app
COPY packages/gateway/pyproject.toml ./
COPY packages/gateway/src ./src
COPY packages/gateway/config ./config
COPY packages/shared/schema ./schema
RUN pip install --no-cache-dir . && mkdir -p /data && chown nobody /data
ENV BUFFER_PATH=/data/buffer.sqlite \
    SCHEMA_PATH=/app/schema/envelope.v1.schema.json \
    TAGMAP_PATH=/app/config/tagmap.mock.json \
    PYTHONUNBUFFERED=1
VOLUME ["/data"]
USER nobody
CMD ["n2-gateway"]
