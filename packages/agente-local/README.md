# Agente local (Node-RED da bancada) — Grupo 1 · Sprint 3

Export versionado do Node-RED que roda no notebook da bancada (`192.168.150.200:1880`).
É o mesmo conteúdo de `node-red/flow_ingestao_n2.json`, gerado por `node tools/exportar-agente-local.js`.

| Arquivo | O que é |
|---|---|
| `node-red/flows.json` | Export das 3 abas: **Ingestão N2**, **Comandos e SPA local**, **Ponte borda-nuvem WSS** |
| `node-red/settings.js` | Configuração do Node-RED (SQLite, WebSocket nativo, guarda da URL do broker) |
| `node-red/package.json` | Dependências que precisam ser reinstaladas depois do import |

**Sem segredos.** O export do Node-RED não leva senhas (ficam em `flows_cred.json`, fora do Git).
A URL do broker e o token do agente **não** ficam no fluxo: vêm de variáveis de ambiente do sistema.

## Reconfiguração depois de importar

Requisito: **Node.js 22.13 ou mais novo** (o `node:sqlite` e o `WebSocket` nativo são usados pela outbox e pela ponte).

### 1. Dependências

```bat
cd /d %USERPROFILE%\.node-red
npm install node-red-contrib-s7@3.1.3
```

O roteiro cita `node-red-contrib-websocket-client`; **não é necessário**: a ponte usa o cliente WebSocket nativo do
Node.js dentro do nó "Ponte: cliente WSS" (motivo na decisão D-G1-12, `docs/decisions/G1-decisoes-sprint3.md`).

### 2. settings.js

Copie `node-red/settings.js` para `%USERPROFILE%\.node-red\settings.js` (faça backup do original).
Ao subir, ele **recusa** `SMART40_BROKER_URL` com `ws://`, com domínio da Vercel ou com `?token=` na URL.

### 3. Variáveis de ambiente (nunca no Git, nunca em print)

| Variável | Valor | Onde conseguir |
|---|---|---|
| `SMART40_BROKER_URL` | `wss://smart40-broker.onrender.com` (sem `?token=`) | roteiro da Sprint 3 |
| `SMART40_AGENT_TOKEN` | token do agente da unidade 1 | emitido pelo G5 |
| `NODE_RED_CREDENTIAL_SECRET` | chave longa qualquer | o grupo define |
| `NODE_OPTIONS` | `--tls-min-v1.3` | MQTTS (Sprint 2) |

No Windows (prompt que vai rodar o Node-RED):

```bat
set SMART40_BROKER_URL=wss://smart40-broker.onrender.com
set SMART40_AGENT_TOKEN=<token do agente>
set NODE_RED_CREDENTIAL_SECRET=<chave do grupo>
set NODE_OPTIONS=--tls-min-v1.3
node-red
```

### 4. Importar e configurar

1. `http://localhost:1880` → ☰ → **Import** → `flows.json` → **Import** → **Deploy**.
   Se o Node-RED avisar que os nós já existem (fluxo da Sprint 2 importado antes), escolha **Replace**.
2. **IPs dos CLPs** (duplo clique no nó de configuração `s7 endpoint`):

   | Endpoint | IP no fluxo | Situação |
   |---|---|---|
   | Estoque S7-1200 (somente leitura) | `192.168.150.10` | confirmado no fluxo que já roda na bancada |
   | CLP comandos DB1 (escrita) | `192.168.150.10` | **A CONFIRMAR** com o responsável da automação (o roteiro cita `.30`, que o manual da planta indica ser o S7-1500 da Montagem) |
   | Processo / Montagem / Expedição | `192.168.150.20` / `.30` / `.40` | lidos hoje via DBs 101–103 do CLP do Estoque; endpoints próprios só se o inventário pedir |

3. **Broker MQTT da Sprint 2** (nó "MQTTS → HiveMQ Cloud"): cluster, usuário e senha do grupo. Se não for usar o
   HiveMQ, desative a aba de ingestão só nesse nó (o resto funciona sem ele).
4. **Aba "Ingestão N2"** → Environment Variables → `INPUT_MODE`: `CLP` na bancada, `SIMULADOR` em casa,
   `TESTE_B` para o Teste B, `REPLAY` para homologação sem hardware.
5. **Aba "Comandos e SPA local"** → `CLP_WRITE_AUTHORIZED` fica `false` e `CLP_WRITE_AUTH_REF` vazio
   **até existir a autorização escrita** do responsável da automação
   (`docs/evidence/sprint3/G1-S3-autorizacao-escrita-clp.md`). Sem os dois, nenhum comando chega aos `s7 out`.

### 5. Conferir

| Verificação | Como | Esperado |
|---|---|---|
| Ponte conectada | `http://localhost:1880/edge/ponte` | `"online": true`, `host: smart40-broker.onrender.com` |
| Outbox da ponte | mesmo endpoint, bloco `outbox` | `PENDING` perto de 0 com o link no ar |
| Comandos auditados | `http://localhost:1880/edge/comandos` | uma linha por comando (aceito ou rejeitado) |
| Nada publica na Vercel | busca por `vercel` no `flows.json` | nenhuma URL; só o texto da regra |
| Nenhum `ws://` para a nuvem | busca por `ws://` no `flows.json` | nenhuma ocorrência |
