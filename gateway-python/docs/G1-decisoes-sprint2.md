# Grupo 1 — Decisões e divergências da Sprint 2 (gêmeo digital)

Status de cada decisão: PROPOSTA até aprovação dos grupos indicados.

## D-G1-07 — Contrato único: envelope v1 (snake_case)

Os arquivos-base trazem **dois contratos incompatíveis** para a mesma telemetria:

| | `envelope.v1.schema.json` (Estrutura / monorepo) | `telemetry-envelope-v2.json` (Processo2) |
|---|---|---|
| Estilo | `unit_id`, `asset_id`, `seq`, `stream_id` | `unitId`, `assetId`, `sequence` |
| Qualidade | objeto `{status: GOOD/UNCERTAIN/BAD, source_code, reason}` | string `Good/Uncertain/Bad/BadInternalError` |
| Padrão de tag | `machine.state` (com ponto) | `estado_maquina` (sem ponto) |
| Vetores (juntas do robô) | aceita `array` | **não aceita** |
| `$id` | `envelope.v1` | diz `-v2` no arquivo e `-v1` no `$id` |

**Proposta:** adotar só o **v1**. O front (`store.js`, `contract.js`) e o teste `contract-flow` já usam o v1, e o v2
não consegue transportar `robot.joint_position`. O gateway Node de Processo2 fica como referência e **não** é usado.
Aprovadores: G1, G4 (web), backend, docente.

## D-G1-08 — Gateway em Python (asyncua) no lugar do Node (node-opcua)

O CI e o `docker-compose` do monorepo já esperam `packages/gateway` com `uv` + `pytest`, e o mock do CLP é `asyncua`.
Problemas do gateway de Processo2 que motivaram a troca:

1. `client.on("connection_reestablished")` registrado a cada reconexão (vazamento de handlers) e reutiliza a sessão antiga.
2. `wsBridge` descarta o buffer da memória ao reiniciar o processo (sem persistência).
3. `wsBridge.send` envia em lote **sem confirmação**: se o socket cair no meio, o lote se perde.
4. `origin: "medido"` fixo, inclusive quando a fonte é simulador.
5. `node-opcua.js` tem endereço do CLP no código (`IP_DO_CLP`), contra a regra do próprio `config.js`.

## D-G1-09 — Correções no esqueleto do monorepo

| Arquivo | Problema | Correção |
|---|---|---|
| `normalize.py` | `message_id = stream_id:seq` colide após reinício (seq volta a 0) | `stream_id` inclui boot id |
| `normalize.py` | `quality` sempre `GOOD` | vem do StatusCode OPC UA; sessão perdida → `BAD` |
| `normalize.py` | `gateway_utc` só com segundos | ISO-8601 UTC com milissegundos |
| `normalize.py` | `component_id` fora do schema | movido para `context.component_id` |
| `mosquitto.conf` | listener 8883 **sem TLS** e anônimo (porta de MQTTS sem criptografia) | removido; local só 1883. Nuvem: HiveMQ 8883 com TLS |
| `validate.js` | importava `./envelope.v1.schema.json` (arquivo em outra pasta) | caminho `../schema/` |
| `docker-compose.yaml` | serviço `backend` sem pacote correspondente | comentado até existir |
| `mock_plc.py` | não podia ser usado em teste (loop infinito sem parada) | função `serve()` com `ready`/`stop` |

## D-G1-10 — Tópicos MQTT

`n2/v1/{unit_id}/{asset_id}/{tag}` (um tópico por tag) e `.../_status` retido com last-will.
Um tópico por tag permite ao backend assinar só o que precisa (ex.: `n2/v1/+/+/robot/#`).
Substitui `industria40/telemetry/data` da Sprint 1 para o gêmeo digital; o fluxo Node-RED da Sprint 1 continua
valendo para o `iot-service` até o backend novo existir.

## Pendências (dependem da bancada / de outros grupos)

1. **OPC UA no S7-1200.** O CLP da bancada fala S7 (porta 102) no fluxo atual. Para usar o gateway direto no CLP é
   preciso firmware ≥ 4.4 com o servidor OPC UA habilitado e os DBs expostos. **Não alterar a CPU por conta própria.**
   Alternativa sem mexer no CLP: manter o Node-RED S7 da Sprint 1 e publicar no mesmo envelope v1.
2. **NodeIds de `config/tagmap.n2.json`** são rascunho derivado dos endereços S7 (`A CONFIRMAR`).
3. **UR3e real:** trocar o leitor JSON por cliente RTDE (porta 30004, binário). Os nomes de tag não mudam.
4. **Ainda sem tag:** velocidade da esteira e botão Reset (pendência herdada da Sprint 1).
