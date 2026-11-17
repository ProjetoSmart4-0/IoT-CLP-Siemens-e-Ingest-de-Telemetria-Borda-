-- =============================================================================
-- OUTBOX DA PONTE BORDA-NUVEM (SQLite) — Grupo 1 · Sprint 3 · entregável 14
-- Banco: SQLite no notebook da bancada (NÃO é o Postgres/Neon).
-- Arquivo: ~/.node-red/outbox_ponte_wss.sqlite (ou PONTE_OUTBOX_PATH). O nó
-- "Ponte: grava na outbox (SQLite)" executa este mesmo DDL ao iniciar.
-- Criar à mão (opcional):  sqlite3 outbox_ponte_wss.sqlite < db/outbox_telemetry.sql
--
-- Mesma tabela outbox_telemetry da Sprint 2 (db/002_outbox_telemetry.sql, canal MQTT),
-- num arquivo separado para o canal WSS, com a coluna "sent" do roteiro (seção 6.4):
--   roteiro: outbox_telemetry(id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT,
--                             created_at TEXT, sent INTEGER DEFAULT 0)
--   aqui:    sent = 1 quando status = 'SENT' (coluna gerada, só leitura)
--
-- Ciclo de vida de cada frame (envio "pelo menos uma vez", equivalente ao QoS 1):
--   PENDING  -> gravado antes de qualquer envio
--   INFLIGHT -> enviado pelo socket wss://, aguardando confirmação
--   SENT     -> confirmado: WSS_ACK_GRACE_MS (1 s) com a MESMA conexão aberta e o buffer
--               de saída vazio (WSS_CONFIRM=GRACE) ou eco do broker (WSS_CONFIRM=ECHO)
--   conexão caiu / reinício / sem eco -> INFLIGHT volta a PENDING e sai de novo, em ordem de id
--   limpeza: só apaga SENT com mais de OUTBOX_RETENTION_H horas (nunca o que não foi confirmado)
-- created_offline = 1 -> gravado com o link fora; sai com meta.buffered = true
-- msg_id UNIQUE       -> o consumidor descarta reenvios repetidos por meta.msg_id
--
-- audit_comandos: trilha de auditoria do canal de comandos (aceitos e rejeitados,
-- com origem, motivo, modo e resultado da escrita no CLP).
-- =============================================================================
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS outbox_telemetry (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    msg_id           TEXT    NOT NULL UNIQUE,
    topic            TEXT    NOT NULL,
    payload          TEXT    NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'INFLIGHT', 'SENT')),
    sent             INTEGER GENERATED ALWAYS AS (CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) VIRTUAL,
    created_offline  INTEGER NOT NULL DEFAULT 0,
    attempts         INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL,
    last_attempt_at  TEXT,
    sent_at          TEXT,
    last_error       TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_status_id ON outbox_telemetry (status, id);
CREATE INDEX IF NOT EXISTS idx_outbox_sent_at ON outbox_telemetry (sent_at);
CREATE TABLE IF NOT EXISTS audit_comandos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts              TEXT    NOT NULL,
    canal           TEXT    NOT NULL,
    cmd_id          TEXT,
    acao            TEXT,
    origem          TEXT,
    decisao         TEXT    NOT NULL CHECK (decisao IN ('ACEITO', 'REJEITADO')),
    motivo          TEXT,
    modo            TEXT,
    destino         TEXT,
    escrita_status  TEXT    CHECK (escrita_status IS NULL OR escrita_status IN ('ENVIADA', 'CONFIRMADA', 'ERRO')),
    escrita_erro    TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_comandos (ts);

-- Consultas úteis
--   SELECT status, sent, COUNT(*) FROM outbox_telemetry GROUP BY status;
--   SELECT id, msg_id, attempts, last_error FROM outbox_telemetry WHERE sent = 0 ORDER BY id LIMIT 20;
--   SELECT ts, canal, acao, origem, decisao, motivo, destino, escrita_status FROM audit_comandos ORDER BY id DESC LIMIT 20;
