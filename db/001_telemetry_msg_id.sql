-- =============================================================================
-- MIGRAÇÃO 001 — PROPOSTA DO GRUPO 1 PARA O GRUPO 3 (dono do schema)
-- Objetivo: garantir que a telemetria reenviada pelo buffer offline (store-and-forward)
-- NÃO seja gravada em duplicidade após uma reconexão (teste da Semana 8).
--
-- Não altera colunas: cria um índice ÚNICO sobre raw_payload->>'msg_id'.
-- Linhas antigas sem msg_id (NULL) continuam permitidas.
-- Rodar DEPOIS do init-db-industria40.sql:
--   psql "$DATABASE_URL" -f db/001_telemetry_msg_id.sql
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_telemetry_msg_id
    ON telemetry_logs ((raw_payload->>'msg_id'));

-- Consultas de status filtradas por máquina
CREATE INDEX IF NOT EXISTS idx_telemetry_machine_ts
    ON telemetry_logs ((raw_payload->>'machine_id'), timestamp DESC);
