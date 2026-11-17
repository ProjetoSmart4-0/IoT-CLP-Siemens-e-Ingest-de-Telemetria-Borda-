# Ensaio local da ponte borda-nuvem — Grupo 1 · Sprint 3 · 2026-11-17

Gerado por `tools/ensaio-ponte-local.js`: broker de ensaio local (`wss://localhost`, certificado autoassinado,
token na query, 4001 para token errado, relay entre clientes) + Node-RED temporário com o
`flow_ingestao_n2.json` e o `settings.js` do repositório, CLP simulado.

> **Escopo:** ensaio da lógica sem hardware e sem o broker real. NÃO substitui os testes na bancada
> (`tools/teste-ponte-g1.js` contra `wss://smart40-broker.onrender.com`), que são a evidência do Portão 3.

---

## [ENSAIO LOCAL] Teste A — conectividade (wscat equivalente)

- **Data/hora:** 2026-11-17T22:32:27.262Z (local: 17/11/2026, 22:32:27)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **PASS**

| Passo | Esperado | Obtido |
|---|---|---|
| Conexão com token válido | abre e permanece aberta | abriu em 8 ms, aberta após 3 s |
| Conexão com token propositalmente errado | fechada com código 4001 | código 4001 |

---

## [ENSAIO LOCAL] Teste C — consumo a cada 500 ms

- **Data/hora:** 2026-11-17T22:33:27.282Z (local: 17/11/2026, 22:33:27)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **PASS**

| Métrica | Valor |
|---|---|
| Duração observada | 60 s |
| Frames recebidos / únicos (por meta.msg_id) | 120 / 120 |
| Esperado a 1 frame por 500 ms | 120 |
| Repetições de reenvio descartadas (msg_id já visto) | 0 |
| Frames com buffered=true (vieram da outbox) | 0 |
| Frames stale (sem leitura nova na janela) | 0 |
| Lacunas de seq | 0 |
| Lacunas temporais (> 750 ms entre timestamps) | 0 |
| Chegadas fora de ordem | 0 |
| Passo entre timestamps (p50 / máx) | 500 / 501 ms |
| Intervalo entre chegadas (p50 / p95 / máx) | 500 / 504 / 516 ms |
| Latência borda→observador (p50 / p95 / máx)¹ | 2 / 6 / 19 ms |

¹ Latência = chegada no observador − `timestamp` do frame. Depende do relógio do notebook e do PC observador estarem sincronizados (NTP); em ensaio local é a mesma máquina.

---

## [ENSAIO LOCAL] Canal de comandos — whitelist de origens e EMERGENCY_STOP

- **Data/hora:** 2026-11-17T22:33:43.298Z (local: 17/11/2026, 22:33:43)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **PASS**

| Ação | Origem | Esperado | Ack recebido | Resultado |
|---|---|---|---|---|
| START | unidade1-grupo1 | aceito pela whitelist | aceito · destino SIMULADOR | ok |
| STOP | unidade1-grupo1 | aceito pela whitelist | aceito · destino SIMULADOR | ok |
| RESET | unidade1-grupo1 | aceito pela whitelist | aceito · destino SIMULADOR | ok |
| STOP | unidade1-grupo1 | aceito pela whitelist | aceito · destino SIMULADOR | ok |
| STOP | unidade1-grupo2 | aceito pela whitelist | aceito · destino SIMULADOR | ok |
| STOP | unidade1-grupo3 | aceito pela whitelist | aceito · destino SIMULADOR | ok |
| STOP | unidade1-grupo4 | aceito pela whitelist | aceito · destino SIMULADOR | ok |
| STOP | unidade1-grupo5 | aceito pela whitelist | aceito · destino SIMULADOR | ok |
| START | unidade9-fora-da-lista | REJEITADO: origem não permitida | recusado · destino — · origem não permitida | ok |
| EMERGENCY_STOP | unidade9-fora-da-lista | bypassa a whitelist (motivo ≠ origem) | aceito · destino SIMULADOR | ok |
| RESET | unidade1-grupo1 | aceito pela whitelist | aceito · destino SIMULADOR | ok |

- A rejeição de origem gera `node.warn` no Node-RED e linha REJEITADO em `GET /edge/comandos` (anexe o print).
- Em INPUT_MODE=CLP sem autorização escrita, os acks vêm `recusado · escrita no CLP bloqueada`: comportamento esperado.
- Escrita real no CLP (DB1,X0.4..X0.7) só com a autorização escrita anexada a esta evidência.

---

## [ENSAIO LOCAL] Auditoria do canal de comandos (GET /edge/comandos)

- **Data/hora:** 2026-11-17T22:33:43.308Z (local: 17/11/2026, 22:33:43)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **PASS**

Últimos registros da tabela `audit_comandos`:

| ts | canal | ação | origem | decisão | motivo | destino |
|---|---|---|---|---|---|---|
| 2026-11-17T22:33:41.998Z | wss | RESET | unidade1-grupo1 | ACEITO | simulador | SIMULADOR |
| 2026-11-17T22:33:40.696Z | wss | EMERGENCY_STOP | unidade9-fora-da-lista | ACEITO | simulador | SIMULADOR |
| 2026-11-17T22:33:39.396Z | wss | START | unidade9-fora-da-lista | REJEITADO | origem não permitida | NENHUM |
| 2026-11-17T22:33:38.096Z | wss | STOP | unidade1-grupo5 | ACEITO | simulador | SIMULADOR |
| 2026-11-17T22:33:36.795Z | wss | STOP | unidade1-grupo4 | ACEITO | simulador | SIMULADOR |
| 2026-11-17T22:33:35.494Z | wss | STOP | unidade1-grupo3 | ACEITO | simulador | SIMULADOR |
| 2026-11-17T22:33:34.192Z | wss | STOP | unidade1-grupo2 | ACEITO | simulador | SIMULADOR |
| 2026-11-17T22:33:32.891Z | wss | STOP | unidade1-grupo1 | ACEITO | simulador | SIMULADOR |
| 2026-11-17T22:33:31.590Z | wss | RESET | unidade1-grupo1 | ACEITO | simulador | SIMULADOR |
| 2026-11-17T22:33:30.289Z | wss | STOP | unidade1-grupo1 | ACEITO | simulador | SIMULADOR |
| 2026-11-17T22:33:28.991Z | wss | START | unidade1-grupo1 | ACEITO | simulador | SIMULADOR |

`node.warn` capturado no log do Node-RED:

```
Comando rejeitado de origem: unidade9-fora-da-lista
```

---

## [ENSAIO LOCAL] Resiliência — broker fora por 20 s

- **Data/hora:** 2026-11-17T22:34:20.324Z (local: 17/11/2026, 22:34:20)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **PASS**

| Métrica | Valor |
|---|---|
| Duração observada | 37 s |
| Frames recebidos / únicos (por meta.msg_id) | 76 / 74 |
| Esperado a 1 frame por 500 ms | 74 |
| Repetições de reenvio descartadas (msg_id já visto) | 2 |
| Frames com buffered=true (vieram da outbox) | 50 |
| Frames stale (sem leitura nova na janela) | 0 |
| Lacunas de seq | 0 |
| Lacunas temporais (> 750 ms entre timestamps) | 0 |
| Chegadas fora de ordem | 0 |
| Passo entre timestamps (p50 / máx) | 500 / 502 ms |
| Intervalo entre chegadas (p50 / p95 / máx) | 500 / 510 / 25509 ms |
| Latência borda→observador (p50 / p95 / máx)¹ | 2 / 3 / 11 ms |

¹ Latência = chegada no observador − `timestamp` do frame. Depende do relógio do notebook e do PC observador estarem sincronizados (NTP); em ensaio local é a mesma máquina.

- Link fora por 20 s. Outbox no fim da queda: PENDING 42 · INFLIGHT 0.
- Quedas do próprio observador: 1 (na queda do broker o observador também cai e reconecta).

---

## [ENSAIO LOCAL] Resiliência — link da borda derrubado pelo inject de teste por 30 s

- **Data/hora:** 2026-11-17T22:35:07.346Z (local: 17/11/2026, 22:35:07)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **PASS**

| Métrica | Valor |
|---|---|
| Duração observada | 47 s |
| Frames recebidos / únicos (por meta.msg_id) | 96 / 94 |
| Esperado a 1 frame por 500 ms | 94 |
| Repetições de reenvio descartadas (msg_id já visto) | 2 |
| Frames com buffered=true (vieram da outbox) | 60 |
| Frames stale (sem leitura nova na janela) | 0 |
| Lacunas de seq | 0 |
| Lacunas temporais (> 750 ms entre timestamps) | 0 |
| Chegadas fora de ordem | 0 |
| Passo entre timestamps (p50 / máx) | 500 / 503 ms |
| Intervalo entre chegadas (p50 / p95 / máx) | 500 / 503 / 30509 ms |
| Latência borda→observador (p50 / p95 / máx)¹ | 2 / 4 / 4 ms |

¹ Latência = chegada no observador − `timestamp` do frame. Depende do relógio do notebook e do PC observador estarem sincronizados (NTP); em ensaio local é a mesma máquina.

- Link fora por 30 s. Outbox no fim da queda: PENDING 62 · INFLIGHT 0.
- Quedas do próprio observador: 0 (na queda do broker o observador também cai e reconecta).

---

## [ENSAIO LOCAL] Estado da ponte no fim (GET /edge/ponte)

- **Data/hora:** 2026-11-17T22:35:07.356Z (local: 17/11/2026, 22:35:07)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **INFO**

```json
{
  "online": true,
  "host": "localhost:8443",
  "epoch": 3,
  "conexoes": 3,
  "ultimo_fechamento": {
    "code": 4000,
    "reason": "teste de resiliencia",
    "ts": "2026-11-17T22:34:25.337Z"
  },
  "link_derrubado_teste": false,
  "enviados": 329,
  "confirmados": 322,
  "reenfileirados": 4,
  "modo_confirmacao": "GRACE",
  "reconexao_ms": 5000,
  "erro_config": null
}
```
Outbox: {"PENDING":0,"INFLIGHT":3,"SENT":322}

---

## [ENSAIO LOCAL] Log do Node-RED na fase SIMULADOR (erros e avisos agrupados)

- **Data/hora:** 2026-11-17T22:35:07.360Z (local: 17/11/2026, 22:35:07)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **INFO**

```
33× [s7 endpoint:Estoque S7-1200 <ip> (somente leitura)] Error: connect ECONNREFUSED <ip>
33× [s7 endpoint:CLP comandos DB1 (ESCRITA — só com autorização; IP A CONFIRMAR)] Error: connect ECONNREFUSED <ip>
--- avisos ---
1× Projects disabled : set editorTheme.projects.enabled=true to enable
1× 
1× Encrypted credentials not found
1× [function:validarComando] Comando rejeitado de origem: unidade9-fora-da-lista
2× [function:Ponte: cliente WSS → smart40-broker] Ponte WSS reconectada a localhost:<porta>. Na outbox: N
```

---

## [ENSAIO LOCAL · INPUT_MODE=CLP sem autorização] Canal de comandos — whitelist de origens e EMERGENCY_STOP

- **Data/hora:** 2026-11-17T22:35:24.917Z (local: 17/11/2026, 22:35:24)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **PASS**

| Ação | Origem | Esperado | Ack recebido | Resultado |
|---|---|---|---|---|
| START | unidade1-grupo1 | aceito pela whitelist | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |
| STOP | unidade1-grupo1 | aceito pela whitelist | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |
| RESET | unidade1-grupo1 | aceito pela whitelist | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |
| STOP | unidade1-grupo1 | aceito pela whitelist | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |
| STOP | unidade1-grupo2 | aceito pela whitelist | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |
| STOP | unidade1-grupo3 | aceito pela whitelist | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |
| STOP | unidade1-grupo4 | aceito pela whitelist | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |
| STOP | unidade1-grupo5 | aceito pela whitelist | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |
| START | unidade9-fora-da-lista | REJEITADO: origem não permitida | recusado · destino — · origem não permitida | ok |
| EMERGENCY_STOP | unidade9-fora-da-lista | bypassa a whitelist (motivo ≠ origem) | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |
| RESET | unidade1-grupo1 | aceito pela whitelist | recusado · destino NENHUM · escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) | ok |

- A rejeição de origem gera `node.warn` no Node-RED e linha REJEITADO em `GET /edge/comandos` (anexe o print).
- Em INPUT_MODE=CLP sem autorização escrita, os acks vêm `recusado · escrita no CLP bloqueada`: comportamento esperado.
- Escrita real no CLP (DB1,X0.4..X0.7) só com a autorização escrita anexada a esta evidência.

---

## [ENSAIO LOCAL] Escrita no CLP sem autorização escrita (INPUT_MODE=CLP)

- **Data/hora:** 2026-11-17T22:35:24.925Z (local: 17/11/2026, 22:35:24)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **PASS**

- Comandos auditados: 11 · encaminhados ao CLP: 0 · bloqueados por falta de autorização: 10.
- Sem CLP_WRITE_AUTHORIZED=true **e** CLP_WRITE_AUTH_REF preenchido, nenhum comando chega aos nós s7 out.
- Neste ensaio não há CLP na rede: o endpoint S7 apenas registra erro de conexão (esperado).

---

## [ENSAIO LOCAL] Log do Node-RED na fase CLP (erros e avisos agrupados)

- **Data/hora:** 2026-11-17T22:35:24.928Z (local: 17/11/2026, 22:35:24)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **INFO**

```
4× [s7 endpoint:Estoque S7-1200 <ip> (somente leitura)] Error: connect ECONNREFUSED <ip>
4× [s7 endpoint:CLP comandos DB1 (ESCRITA — só com autorização; IP A CONFIRMAR)] Error: connect ECONNREFUSED <ip>
--- avisos ---
1× Projects disabled : set editorTheme.projects.enabled=true to enable
1× 
1× Encrypted credentials not found
1× [function:aplicarComando] escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) — START de unidade1-grupo1
2× [function:aplicarComando] escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) — STOP de unidade1-grupo1
2× [function:aplicarComando] escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) — RESET de unidade1-grupo1
1× [function:aplicarComando] escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) — STOP de unidade1-grupo2
1× [function:aplicarComando] escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) — STOP de unidade1-grupo3
1× [function:aplicarComando] escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) — STOP de unidade1-grupo4
1× [function:aplicarComando] escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) — STOP de unidade1-grupo5
1× [function:validarComando] Comando rejeitado de origem: unidade9-fora-da-lista
1× [function:aplicarComando] escrita no CLP bloqueada: falta autorização escrita (CLP_WRITE_AUTHORIZED / CLP_WRITE_AUTH_REF) — EMERGENCY_STOP de unidade9-fora-da-l
```

---

## [ENSAIO LOCAL] Teste B — payload sintético no lugar do s7 in

- **Data/hora:** 2026-11-17T22:35:34.457Z (local: 17/11/2026, 22:35:34)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **PASS**

Payload injetado no lugar do `s7 in`: `{statusEstoqueOk: true, emergenciaEstoque: false, motorEsteira1: true, posEstoque: 5}`

| Verificação | OK? |
|---|---|
| meta.origem_dados = TESTE_B | sim |
| esteira.motorLigado = true (motorEsteira1) | sim |
| estacoes.estoque.magazine = 5 (posEstoque) | sim |
| estacoes.estoque.status = OPERANDO | sim |
| nenhuma estação em EMERGENCIA (emergenciaEstoque = false) | sim |

Frames TESTE_B recebidos: 15 de 15 em 8 s.

Último frame recebido:

```json
{
  "timestamp": "2026-11-17T22:35:34.319Z",
  "roboUR": {
    "posicaoCartesiana": {
      "x": 0,
      "y": 0,
      "z": 0
    },
    "posicaoJuntas": [
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "garraFechada": false
  },
  "esteira": {
    "motorLigado": true,
    "pecaAtual": null
  },
  "estacoes": {
    "estoque": {
      "status": "OPERANDO",
      "magazine": 5
    },
    "processo": {
      "status": "AGUARDANDO",
      "magazine": 0
    },
    "montagem": {
      "status": "AGUARDANDO",
      "magazine": 0
    },
    "expedicao": {
      "status": "AGUARDANDO",
      "magazine": 0
    }
  },
  "pedidoAtual": null,
  "meta": {
    "contrato": "envelope-telemetria-1.0",
    "node_id": "borda_n2",
    "msg_id": "borda_n2-1794954934319-15",
    "boot": "2026-11-17T22:35:26.117Z",
    "seq": 15,
    "origem_dados": "TESTE_B",
    "amostras": 5,
    "stale": false,
    "buffered": false
  }
}
```

---

## [ENSAIO LOCAL] Log do Node-RED na fase TESTE_B (erros e avisos agrupados)

- **Data/hora:** 2026-11-17T22:35:34.461Z (local: 17/11/2026, 22:35:34)
- **Versão:** commit sem git · flow_ingestao_n2.json sha256 802d10544541
- **Broker:** wss://localhost:8443 · token lido de `(token do broker de ensaio)` (não registrado)
- **Executado por:** ? em vm
- **Resultado:** **INFO**

```
2× [s7 endpoint:Estoque S7-1200 <ip> (somente leitura)] Error: connect ECONNREFUSED <ip>
2× [s7 endpoint:CLP comandos DB1 (ESCRITA — só com autorização; IP A CONFIRMAR)] Error: connect ECONNREFUSED <ip>
--- avisos ---
1× Projects disabled : set editorTheme.projects.enabled=true to enable
1× 
1× Encrypted credentials not found
```

---

## Resumo do ensaio

| Teste | Resultado |
|---|---|
| A | PASS |
| C | PASS |
| comandos | PASS |
| queda_broker | PASS |
| queda_link | PASS |
| clp_sem_autorizacao | PASS |
| B | PASS |
