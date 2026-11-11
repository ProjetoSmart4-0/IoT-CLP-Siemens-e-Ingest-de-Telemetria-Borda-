# Evidências — Grupo 1 — Sprint 2

| Item | Evidência | Status |
|---|---|---|
| Testes do fluxo (agregação, outbox, replay) | `node node-red/tests/ingestao-n2.test.js` | PASS |
| Testes do iot-service (mensagem agregada) | `cd iot-service && python -m pytest -q` | PASS |
| Gateway Python: 31 testes | `img/G1-S2-01-gateway-31-testes.png` | PASS |
| Gateway Python: mensagens no MQTT | `img/G1-S2-02-gateway-mensagens-mqtt.png` | PASS |
| Gateway Python: store-and-forward | `img/G1-S2-03-gateway-store-and-forward.png` | PASS |
| Replay com captura simulada | `G1-replay-AAAA-MM-DD.md` (gerado pelo script) | PASS WITH LIMITATION |
| Replay com captura real | a gerar na bancada | BLOCKED (hardware) |
| Inventário conferido no TIA | `docs/tags/inventario_mapa_tags_n2.xlsx` | A CONFIRMAR |
| iot-service no Cloud Run | print do console + `GET /health` | a fazer pelo grupo |

Nada aqui pode conter senha, token, URL do banco ou credencial do HiveMQ.
