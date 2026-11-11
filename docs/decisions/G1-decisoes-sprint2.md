# Decisões do Grupo 1 — Sprint 2

Status de cada decisão: PROPOSTA até aprovação dos grupos indicados.

| ID | Decisão | Aprovadores | Status |
|---|---|---|---|
| D-G1-07 | Agregação de 500 ms (schema 1.1) | G1, G3, G4 | PROPOSTA |
| D-G1-08 | Outbox SQLite com confirmação por PUBACK | G1, docente | PROPOSTA |
| D-G1-09 | TLS 1.3 obrigatório na borda | G1, G5 | PROPOSTA |
| D-G1-10 | Replay como homologação sem hardware | G1, docente | PROPOSTA |
| D-G1-11 | Montagem (S7-1500) por OPC UA | G1, docente | PROPOSTA |

## D-G1-07 — Agregação de 500 ms

O CLP é lido a cada 100 ms e o fluxo emite **uma mensagem por janela de 500 ms** (2 msg/s, ~7.200 linhas/h no Neon).
Na Sprint 1 a borda publicava só em mudança + heartbeat de 5 s; o enunciado da Sprint 2 pede transmissão em 500 ms.

- Estado e valores: os da última leitura da janela. Botões: OU lógico na janela, para não perder um toque de 100 ms.
- Novo bloco `aggregation` (`window_ms`, `samples`, `belt_running_ratio`, `states_seen`, `state_changes`).
- `schema_version` = `1.1`: só acrescenta campos; o iot-service aceita `1.x` e guarda tudo em `raw_payload`.
- `event`: `STATE_CHANGE` (mudou estado ou houve START/STOP na janela) ou `PERIODIC`.
- **Impacto no G3:** ~170 mil linhas/dia por bancada ligada 24 h. Sugerimos retenção ou agregação no banco para o histórico longo.

## D-G1-08 — Outbox SQLite com confirmação por PUBACK

Tabela `outbox_telemetry` (`db/002_outbox_telemetry.sql`) num SQLite local, aberta pelo módulo nativo `node:sqlite`
(Node.js ≥ 22.13), sem dependência compilada. Estados `PENDING → INFLIGHT → SENT`.

- A linha só vira `SENT` quando o nó `complete` do `mqtt out` dispara, o que no Node-RED 4 acontece no callback do
  publish QoS 1, isto é, com o PUBACK. Verificado no código do nó e em teste com broker real.
- `mqtt out` com o broker desconectado descarta a mensagem sem erro. Por isso o despachante só envia online e
  reenvia o que ficar `INFLIGHT` por mais de `ACK_TIMEOUT_MS` (5 s).
- Enquanto houver `INFLIGHT`, não sai lote novo: a ordem é preservada.
- Entrega "pelo menos uma vez": duplicatas possíveis no reenvio são descartadas pelo `msg_id` (iot-service + índice da migração 001).
- Limites: `OUTBOX_MAX` (200 mil pendentes, ~28 h offline) e limpeza das `SENT` após 24 h.
- Substitui o buffer em arquivo de contexto da Sprint 1, que apagava a mensagem antes da confirmação do broker.

## D-G1-09 — TLS 1.3

O nó `tls-config` do Node-RED não tem opção de versão mínima. O Node.js negocia TLS 1.3 com o HiveMQ Cloud por padrão;
para **exigir** 1.3, o Node-RED roda com `NODE_OPTIONS=--tls-min-v1.3` (já no `docker-compose.yml` e no README).

## D-G1-10 — Replay

`CAPTURE=true` com `INPUT_MODE=CLP` grava cada leitura de 100 ms em JSONL. `tools/replay-telemetria.js` reinjeta a
captura (`INPUT_MODE=REPLAY`, `POST /replay/s7`) no tempo original e gera o relatório em `docs/evidence/sprint2/`.
As mensagens de replay saem com `source: "REPLAY"` e `replay.captured_at`, para não serem confundidas com dado ao vivo.

## D-G1-11 — Montagem (S7-1500) por OPC UA

O manual da planta mostra o servidor OPC UA do S7-1500 da Montagem em `opc.tcp://192.168.150.30:4840`
(licença "SIMATIC OPC UA S7-1500 small", DB com "Data block accessible from OPC UA"). O fluxo da bancada hoje lê os
sinais da Montagem pelo DB102 do CLP do Estoque. Proposta: manter isso no Node-RED e usar o `gateway-python` para a
leitura OPC UA direta quando os NodeIds forem levantados no UaExpert. **Não ativar o servidor OPC UA na CPU sem o
responsável da automação.**

## Pendências

1. Conferir o inventário no TIA Portal v17 (endereços do enunciado `DB1.DBX0.0/0.1/0.2` e `DB1.DBD4` × endereços do fluxo da bancada).
2. Endereço do botão RESET e da velocidade da esteira.
3. Captura real na bancada para o replay de homologação.
4. Deploy do iot-service no Cloud Run e banco no Neon (contas do grupo; comandos no README da Sprint 1).
