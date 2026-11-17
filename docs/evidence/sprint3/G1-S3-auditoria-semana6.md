# Auditoria do fluxo Node-RED — Semana 6 (roteiro, passos 1 a 4)

- **Data:** 17/11/2026 · **Versão:** `node-red/flow_ingestao_n2.json` desta entrega
- **Método:** leitura do export + testes automáticos (`node-red/tests/*.test.js`). Itens marcados "bancada" só fecham no notebook 192.168.150.200.

| Passo | Verificação | Como foi conferido | Resultado |
|---|---|---|---|
| 1 | `s7 in` / `s7 out` só na bancada, nunca na nuvem | Únicos nós S7 estão no fluxo local; iot-service e SPA não falam S7 | PASS |
| 1 | Polling dos CLPs em 100 ms | `s7 endpoint` com `cycletime: 100` | PASS (código) · bancada: conferir status do nó |
| 1 | Agregação/publicação em 500 ms | `AGG_WINDOW_MS=500` (MQTT) e `ENVELOPE_WINDOW_MS=500` (WSS); teste mede 500 ms entre frames | PASS |
| 1 | Backup do fluxo em `packages/agente-local/node-red/flows.json` | `tools/exportar-agente-local.js` | PASS · na bancada repetir com Ctrl+A → Export |
| 2 | Cliente WebSocket: URL `wss://smart40-broker.onrender.com` com token do agente | URL e token por variável de ambiente; token nunca no fluxo | PASS (código) · bancada: `/edge/ponte` online |
| 2 | Reconexão habilitada a cada 5000 ms | `WSS_RECONNECT_MS=5000`; teste mede 5000 ms entre tentativas | PASS |
| 2 | Nunca `ws://`; nunca aponta para a Vercel | `settings.js` impede o Node-RED de subir; o nó recusa de novo; teste cobre os 3 casos | PASS |
| 3 | Envelope: timestamp ISO-8601 UTC, roboUR {posicaoCartesiana x/y/z, posicaoJuntas[6], garraFechada}, esteira {motorLigado, pecaAtual}, estações com AGUARDANDO/OPERANDO/EMERGENCIA e magazine, pedidoAtual | `ponte-wss.test.js` confere campo a campo | PASS na estrutura · **divergência:** roboUR, pecaAtual e magazine sem tag no CLP (valores padrão) — levar ao G5 |
| 3 | Bloco `meta` (msg_id, seq, boot, stale, buffered) | Acrescentado para deduplicar e detectar lacunas | PROPOSTA ao G5 (D-G1-13) |
| 4 | `outbox_telemetry` com gravação local antes do envio | `db/outbox_telemetry.sql`; nó "Ponte: grava na outbox" | PASS |
| 4 | Descarregamento ordenado, QoS 1, sem lacunas | Envio por `id` crescente; INFLIGHT volta a PENDING na queda; ensaio: 0 lacunas | PASS (ensaio) · bancada: teste de resiliência |

Divergências abertas: IP do CLP de comandos (`.10` × `.30` do roteiro), existência de DB1,X0.4–X0.7 no TIA, campos do robô.
