# Contrato do Grupo 1 e divergências encontradas nos arquivos-base

## 1. Tópicos MQTT (HiveMQ Cloud, MQTTS 8883)

| Tópico | Publicador | QoS / Retain | Conteúdo |
|---|---|---|---|
| `industria40/telemetry/data` | Node-RED (borda) | 1 / não | Telemetria (abaixo) |
| `industria40/edge/status` | Node-RED (birth / last-will) | 1 / **sim** | `{"status":"ONLINE"\|"OFFLINE","machine_id":...}` — o Grupo 4 pode usar para exibir **DESCONECTADO** |
| `industria40/telemetry/commands` | iot-service | 1 / não | Comandos (Sprint 1: só publicados; a borda ainda não executa) |

**Frequência:** o CLP é lido a cada 100 ms, mas só publicamos quando algo **muda** + um
**heartbeat a cada 5 s**. Publicar 10 msg/s gravaria ~36.000 linhas/hora no Neon e estouraria
rapidamente os planos gratuitos.

## 2. Mensagem de telemetria (borda → nuvem)

```json
{
  "msg_id": "SMART-40-PLANTA-N2-1759795200123-42-k3j9xq",
  "machine_id": "SMART-40-PLANTA-N2",
  "timestamp": "2026-10-06T23:20:00.123Z",
  "seq": 42,
  "event": "STATE_CHANGE",
  "source": "PLC",
  "buffered": false,
  "machine_state": "RUNNING",
  "belt_running": true,
  "belt_speed": null,
  "belt_speed_source": "UNAVAILABLE",
  "buttons": { "start_pressed": false, "stop_pressed": false, "emergency_pressed": false, "reset_pressed": false },
  "stations": { "processo": { "seguranca_ok": true, "automatico": true, "botao_verde": false,
                               "botao_vermelho": false, "esteira1": true, "esteira2": true },
                "montagem": { "...": "..." }, "expedicao": { "...": "..." } },
  "flags": { "ocupado": true, "aguardando": false, "manual": false, "comutador_automatico": true, "condicao_iniciar": true },
  "numero_op": 1
}
```

- `msg_id` — chave de idempotência; o iot-service ignora repetições (reenvio pós-queda).
- `timestamp` — momento da **leitura** no CLP; mensagens do buffer chegam atrasadas mas com o horário correto.
- `buffered: true` — a mensagem ficou retida offline e foi descarregada na reconexão.

Gravação em `telemetry_logs`: `machine_state`, `belt_speed`, os 4 booleanos de botões e o JSON
completo em `raw_payload`.

## 3. Rotas HTTP do iot-service

| Método e rota | Quem | Observação |
|---|---|---|
| `GET /health` | Cloud Run | Testa o banco |
| `POST /api/v1/telemetry/ingest` | borda/bridge (`X-API-Key`) | Mensagem única ou lista (até 500) |
| `GET /api/v1/telemetry/status` | OPERATOR, ENGINEER, MANAGER, ADMIN | Último estado + `edge_online` |
| `GET /api/v1/telemetry/history?minutes=60&limit=500` | idem | Série histórica |
| `POST /api/v1/telemetry/commands` | OPERATOR, ENGINEER, ADMIN | 202; MANAGER recebe 403 |

## 4. Divergências nos arquivos-base (levar à validação de contrato da Semana 1)

| # | Onde | Problema | O que o iot-service faz hoje |
|---|---|---|---|
| 1 | `openapi-spec.yaml` × `init-db-industria40.sql` | Status: OpenAPI usa `STOPPED, RUNNING, EMERGENCY_STOP, ALARM`; o banco usa `STOPPED, RUNNING, PAUSED, EMERGENCY, ALARM` | Devolve os dois: `machine_state` (banco) e `system_status` (OpenAPI) |
| 2 | `test_integration.py` × OpenAPI | O teste espera `start_button`, `emergency_button`, `conveyor_speed`, que não existem no OpenAPI | Devolve esses campos como aliases de compatibilidade |
| 3 | OpenAPI × SQL × fluxo-base | Velocidade em **m/s** (OpenAPI), **mm/s ou m/min** (SQL), **rpm** (fluxo do professor) — e o CLP **não tem** esse registrador | Publica `null` até haver fonte real |
| 4 | OpenAPI × fluxo-base | Comando de emergência: `EMERGENCY_STOP` × `EMERGENCY` | Aceita os dois |
| 5 | `generate-test-tokens.py` × `test_integration.py` × guia | Três `JWT_SECRET` diferentes | Lê de variável de ambiente; o Grupo 5 precisa definir um único |
| 6 | `db-connection.py` | `insert_telemetry_event` usa colunas `time`, `device_id`, `speed_rpm` que **não existem** em `telemetry_logs` (o mesmo ocorre em `production_orders`) | Não usamos esse arquivo |
| 7 | `docker-compose.yml` × `db-connection.py` | Usuário `admin_40` × `industria40_user` | — |
| 8 | Guia JWT | Diz que assinatura falsa → 403; o padrão HTTP é 401 (403 = autenticado sem permissão) | Usa 401; alinhar com o Grupo 5 |
| 9 | `telemetry_logs` | Não há como evitar duplicata após reconexão | Proposta: `db/001_telemetry_msg_id.sql` (índice único) para o Grupo 3 aprovar |
