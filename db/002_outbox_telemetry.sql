-- =============================================================================
-- OUTBOX LOCAL DA BORDA (SQLite) — Grupo 1 · Sprint 2
-- Banco: SQLite no PC de borda (NÃO é o Postgres/Neon).
-- Arquivo: ~/.node-red/outbox_n2.sqlite (ou OUTBOX_PATH); o fluxo flow_ingestao_n2.json
-- executa este mesmo DDL ao iniciar (nó "Outbox: grava (SQLite)", aba "On Start").
-- Criar à mão (opcional):  sqlite3 outbox_n2.sqlite < db/002_outbox_telemetry.sql
--
-- Ciclo de vida de cada linha (envio garantido, "pelo menos uma vez"):
--   PENDING  -> gravada antes de qualquer envio
--   INFLIGHT -> publicada no MQTT (QoS 1), aguardando o PUBACK do broker
--   SENT     -> PUBACK recebido (nó "complete"); apagada após OUTBOX_RETENTION_H horas
--   INFLIGHT sem PUBACK em ACK_TIMEOUT_MS, ou erro no publish -> volta a PENDING
-- created_offline = 1 -> gravada com o MQTT fora; sai com "buffered": true
-- msg_id UNIQUE      -> mesma chave de idempotência usada pelo iot-service no Neon
-- =============================================================================
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS outbox_telemetry (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    msg_id           TEXT    NOT NULL UNIQUE,
    topic            TEXT    NOT NULL,
    payload          TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'INFLIGHT', 'SENT')),
    created_offline  INTEGER NOT NULL DEFAULT 0,
    attempts         INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    last_attempt_at  TEXT,
    sent_at          TEXT,
    last_error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_status_id ON outbox_telemetry (status, id);
CREATE INDEX IF NOT EXISTS idx_outbox_sent_at ON outbox_telemetry (sent_at);

-- Consultas úteis
--   SELECT status, COUNT(*) FROM outbox_telemetry GROUP BY status;
--   SELECT id, msg_id, attempts, last_error FROM outbox_telemetry WHERE status != 'SENT' ORDER BY id LIMIT 20;
