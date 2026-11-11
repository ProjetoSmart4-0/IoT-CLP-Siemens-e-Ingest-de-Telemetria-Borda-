# Grupo 1 — Gateway de borda do gêmeo digital N2 (Sprint 2)

Parte do Grupo 1 (IoT, CLP & telemetria) no monorepo `n2-twin`: o **gateway** que lê o CLP (OPC UA) e o
braço UR3e, monta o **envelope v1**, valida contra o schema compartilhado e publica no MQTT com
**store-and-forward**. Inclui os simuladores (CLP e UR) para trabalhar sem a bancada.

```
mock-plc / CLP S7-1200 ──OPC UA (100 ms, só leitura)──┐
                                                      ├─► envelope v1 ─► validação ─► buffer SQLite ─► MQTT QoS 1
mock-ur  / UR3e ─────────stream 10 Hz (só leitura)────┘                   (schema)     (store-and-forward)
                                                                                         n2/v1/{unit}/{asset}/{tag}
```

## O que tem aqui

```
packages/
  gateway/                      ← entrega do Grupo 1 (Python 3.11+)
    src/n2_gateway/
      config.py                 variáveis de ambiente (nenhum endereço no código)
      tagmap.py                 mapa nome semântico → NodeId (único lugar com endereços)
      envelope.py               monta o envelope v1 (substitui o normalize.py do esqueleto)
      validator.py              valida contra packages/shared/schema/envelope.v1.schema.json
      buffer.py                 store-and-forward em SQLite (sobrevive a queda e a reinício)
      publisher.py              MQTT QoS 1, birth/last-will, descarga em ordem
      sources/opcua_source.py   CLP via OPC UA (subscrição, reconexão, BAD ao perder sessão)
      sources/ur_source.py      UR3e (mock em JSON; ponto de troca para RTDE real)
      main.py                   liga tudo + heartbeat gateway.status
    config/tagmap.mock.json     mapa do simulador
    config/tagmap.n2.json       RASCUNHO do mapa da bancada (a confirmar no TIA)
    tests/                      31 testes (unidade, integração com os mocks, ponta a ponta com broker)
    tools/gerar_fixture.py      gera envelopes reais para o teste de contrato do lado JS
  shared/
    schema/envelope.v1.schema.json
    src/validate.js             validador usado por web/backend
    fixtures/gateway-sample.json
    test/gateway-contract.test.js   contrato Python → JS
docker/mock-plc · docker/mock-ur · docker/mosquitto
docker-compose.yaml             broker + mocks + gateway
.github/workflows/grupo1-gateway.yaml
docs/G1-decisoes-sprint2.md     decisões, divergências encontradas e pendências
```

## Rodar

**Com Docker (tudo simulado):**

```bash
docker compose up -d --build
docker compose logs -f gateway
# ver as mensagens:
docker compose exec mosquitto mosquitto_sub -t 'n2/v1/#' -v
```

**Sem Docker:**

```bash
cd packages/gateway
uv sync                         # ou: python -m venv .venv && pip install -e . pytest pytest-asyncio amqtt
uv run pytest -q                # 31 testes, não precisam de Docker nem de bancada

# em 3 terminais:
python ../../docker/mock-plc/mock_plc.py
python ../../docker/mock-ur/mock_ur.py
cp .env.example .env && uv run --env-file .env n2-gateway   # precisa de um broker em localhost:1883
```

Teste de contrato do lado JavaScript: `cd packages/shared && npm test`.

## Contrato publicado

Um tópico por tag, QoS 1, sem retain: `n2/v1/{unit_id}/{asset_id}/{tag com / no lugar de .}`.
Presença do gateway: `n2/v1/{unit_id}/{asset_id}/_status` (retido, last-will `OFFLINE`).

| Tag | Tipo | Unidade | Quando |
|---|---|---|---|
| `machine.state` | string (`parada`, `pronta`, `executando`, `alarme`) | — | na mudança |
| `machine.part_present` | bool | — | na mudança |
| `robot.joint_position` | float64[6] | rad | 10 Hz ÷ `UR_DECIMATION` |
| `robot.tcp_pose` | float64[6] | m\|rad | idem |
| `robot.runtime_state` | string | — | na mudança |
| `gateway.status` | string `online` + contexto (buffer, conexões) | — | a cada `HEARTBEAT_S` |

Garantias para quem consome (web/backend):

- `message_id` é único mesmo após reinício do gateway (`stream_id` inclui um boot id).
- `seq` é monotônico por `stream_id`: dá para deduplicar (QoS 1) e detectar buraco.
- Mensagem retida durante queda chega com `context.buffered = true` e o horário original.
- Falha de leitura vira `quality.status = "BAD"` com `value = null`, nunca valor congelado.
- Dado de simulador sai com `origin = "simulado"` (`ORIGIN` no ambiente); só a bancada real usa `medido`.
- Nenhum envelope fora do schema é publicado (é descartado e contado em `gateway.status`).

## Segurança

O gateway **só lê**. Não existe escrita no CLP nem no robô, e um teste (`test_somente_leitura.py`) falha se alguém
acrescentar. Credenciais (OPC UA, MQTT) só por variável de ambiente; `.env` está no `.gitignore`.

## Status honesto

| Item | Status |
|---|---|
| Gateway com mocks, testes e CI | PASS |
| Queda do broker sem perda e sem buraco de sequência (teste e2e) | PASS |
| Leitura do CLP real | **PASS WITH LIMITATION (mock apenas)**: depende do servidor OPC UA do S7-1200 e da confirmação dos NodeIds (ver `docs/G1-decisoes-sprint2.md`) |
| Leitura do UR3e real | **PASS WITH LIMITATION (mock apenas)**: mock em JSON; falta o cliente RTDE |
