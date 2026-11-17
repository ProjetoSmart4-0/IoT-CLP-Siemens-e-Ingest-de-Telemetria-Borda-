# Grupo 1 — IoT, CLP Siemens & Ingestão de Telemetria (Borda)

Planta N2 / SMART 4.0. Este repositório tem a **Sprint 3** (abaixo), a Sprint 2 e a Sprint 1 (referência).

```
CLP S7-1200 ──S7 100 ms──► Node-RED (notebook da bancada 192.168.150.200)
                             │  aba Ingestão: normaliza + agrega 500 ms ──► outbox MQTT ──MQTTS 8883──► HiveMQ ──► iot-service ──► Neon
                             │  aba Ponte WSS: envelope 500 ms ──► outbox_telemetry (SQLite) ──wss://──► smart40-broker ──► SPA (G4, Vercel)
                             └◄─ comandos START/STOP/RESET/EMERGENCY_STOP ◄── broker ◄── SPA
                                 validarComando (whitelist) ──► simulador | s7 out DB1,X0.4..X0.7 (só com autorização escrita)
```

## Sprint 3 — ponte borda-nuvem (Semanas 6 a 8)

Roteiro: estabilizar e homologar a ponte borda-nuvem com telemetria a cada 500 ms, store-and-forward com SQLite e
canal de comandos seguro e auditável, para o Portão 3 (G4).

| Entregável do roteiro | Arquivo | Status |
|---|---|---|
| 12. Fluxo consolidado de ingestão | `node-red/flow_ingestao_n2.json` (3 abas) | Pronto · testado |
| 13. flows.json versionado + README de reconfiguração | `packages/agente-local/` | Pronto |
| 14. Script SQL da outbox | `db/outbox_telemetry.sql` | Pronto |
| 15. Log dos testes A/B/C | `docs/evidence/sprint3/log_testes_ponte_g1.md` (gerado por `tools/teste-ponte-g1.js`) | Ensaio local PASS · **bancada a executar** |
| 16. Relatório de resiliência/replay | `docs/evidence/sprint3/G1-S3-relatorio-resiliencia.md` | Ensaio local PASS · **bancada a executar** |
| 17. Ata das janelas com o G4 | `docs/evidence/sprint3/G1-S3-ata-janelas-G4.md` | Modelo pronto · reunião pendente |

Situação de cada critério: `docs/evidence/sprint3/README.md`. Decisões: `docs/decisions/G1-decisoes-sprint3.md`.
Contrato do envelope (para o G5): `contracts/events/envelope-ponte-wss.schema.json` e `asyncapi-ponte-wss-grupo1.yaml`.

### O que mudou no fluxo

- **Aba "Ponte borda-nuvem WSS" (nova).** A cada 500 ms monta o envelope do contrato (`timestamp` UTC, `roboUR`,
  `esteira`, `estacoes`, `pedidoAtual`) + bloco `meta` (msg_id, seq, stale, buffered), grava na `outbox_telemetry`
  e envia para `wss://smart40-broker.onrender.com`. Reconexão a cada 5000 ms; ao voltar, reenvia em ordem.
  URL e token vêm de **variáveis de ambiente** (`SMART40_BROKER_URL`, `SMART40_AGENT_TOKEN`); o `settings.js`
  impede o Node-RED de subir com `ws://`, com URL da Vercel ou com token na URL.
  Diagnóstico: `GET /edge/ponte` e `GET /edge/comandos`. Injects "TESTE: derrubar/restaurar link".
- **Aba "Comandos e SPA local".** Comandos chegam do broker ou do painel local; `validarComando` aceita só
  `unidade1-grupo1..5` (rejeição em `node.warn`); `EMERGENCY_STOP` bypassa a whitelist. Ack volta pelo mesmo canal.
  Com `INPUT_MODE=CLP`, escreve pulso em `DB1,X0.4` (START), `X0.5` (STOP), `X0.6` (RESET), `X0.7` (EMERGÊNCIA)
  **somente** com `CLP_WRITE_AUTHORIZED=true` e `CLP_WRITE_AUTH_REF` apontando para a autorização assinada.
  Todo comando fica na tabela `audit_comandos`.
- **Aba "Ingestão".** Novo `INPUT_MODE=TESTE_B` com o payload sintético do roteiro no lugar do `s7 in`.

### Rodar

Node.js **22.13+**. Variáveis em `.env.example` (copie para `.env`, que não vai para o Git).
Instalação na bancada: `packages/agente-local/README.md`.

```bat
:: testes automáticos (sem Node-RED, sem CLP, sem broker)
node node-red\tests\ingestao-n2.test.js
node node-red\tests\spa-websocket.test.js
node node-red\tests\ponte-wss.test.js

:: ensaio local: Node-RED real + broker wss de ensaio (certificado autoassinado), ~4 min
cd tools && npm install && node ensaio-ponte-local.js

:: testes na bancada contra o broker real (cada execução vai para o log de evidências)
set SMART40_BROKER_URL=wss://smart40-broker.onrender.com
set SMART40_TEST_TOKEN=<token de teste do G1>
node tools\teste-ponte-g1.js A
node tools\teste-ponte-g1.js C --duracao 60
node tools\teste-ponte-g1.js resiliencia --duracao 300
node tools\teste-ponte-g1.js comandos --confirmo-bancada-segura
node tools\teste-ponte-g1.js continuidade --duracao 1800

:: segredos (arquivos + histórico do Git)
node tools\verificar-segredos.js --historico
```

Depois de mudar o fluxo: `node tools/exportar-agente-local.js` (atualiza `packages/agente-local`).

### Pendências que dependem de outros (registradas como BLOCKED)

1. Token do agente (G5) e token de teste do G1 para o broker real.
2. Autorização escrita do responsável da automação para qualquer escrita no CLP.
3. Confirmar no TIA Portal: IP do CLP de comandos (roteiro diz `.30`; o fluxo usa `.10`) e existência do `DB1,X0.4..X0.7`.
4. Aprovação do bloco `meta` do envelope (G5) e janelas de teste com o G4.
5. Pendências herdadas da Sprint 2: inventário de tags conferido, deploy do iot-service, replay com captura real.

**Atenção:** `grupo1-iot/` é uma cópia antiga da Sprint 1 dentro do repositório. Recomendamos removê-la (não é usada).

---

# Sprint 2 (referência)

## Sprint 2 — entregáveis

| Entregável | Arquivo | Status |
|---|---|---|
| Fluxo Node-RED (polling 100 ms + agregação 500 ms) | `node-red/flow_ingestao_n2.json` | PASS (simulador e replay); CLP real: PASS WITH LIMITATION |
| Outbox SQLite + envio garantido | `db/002_outbox_telemetry.sql` + nós "Outbox" do fluxo | PASS (testes + queda real de broker) |
| iot-service no Cloud Run gravando no Neon | `iot-service/` | Código e testes prontos (aceita a mensagem agregada); **deploy é feito pelo grupo** |
| **Inventário obrigatório** | `docs/tags/inventario_mapa_tags_n2.xlsx` | Pronto para conferência; endereços **A CONFIRMAR** no TIA Portal v17 |
| Validação de replay | `tools/replay-telemetria.js` | Script pronto e testado com captura simulada; falta **captura real** da bancada |

Decisões e pendências: `docs/decisions/G1-decisoes-sprint2.md`.

### Como funciona o fluxo `flow_ingestao_n2.json`

1. **Aquisição a cada 100 ms.** A variável `INPUT_MODE` da aba escolhe a fonte: `CLP` (nó `s7 in`, bancada real),
   `SIMULADOR` (padrão, com botões START/STOP/EMERGÊNCIA/RESET) ou `REPLAY` (capturas reinjetadas).
2. **Normalização + agregação de 500 ms.** Cada janela vira uma mensagem: estado da última leitura, botões em OU lógico
   (um toque de 100 ms nunca se perde) e o bloco `aggregation` (amostras, % de esteira ligada, estados vistos).
   `schema_version` passa a `1.1`, compatível com o iot-service (aceita `1.x`).
3. **Outbox SQLite (`outbox_telemetry`).** Toda mensagem é gravada antes do envio. `PENDING → INFLIGHT → SENT`;
   só vira `SENT` com o **PUBACK** do broker (nó `complete`). Sem PUBACK em 5 s, ou com erro, volta para `PENDING`
   e é reenviada com o mesmo `msg_id` (o iot-service descarta a duplicata). A ordem é preservada e a fila sobrevive
   a reinício do Node-RED e a queda de energia.
4. **Diagnóstico:** `GET http://localhost:1880/edge/status` (contagem da outbox) e `GET /edge/recent`.

### SPA WebSocket + painel de teste dos botões (PDF Grupo1-SPA-Nodered)

- Na Sprint 3 esta aba foi incorporada ao `flow_ingestao_n2.json` (aba "Comandos e SPA local"); não importe arquivo separado. Os 4 trilhos do PDF, ligados à amostra
  normalizada do fluxo de ingestão por nós *link* (não há segundo `s7 in`). WebSocket em `ws://localhost:1880/ws`.
- Comandos aceitos: `START`, `STOP`, `RESET`, `EMERGENCY_STOP` (`{acao, origem, id, token?}`). Cada um recebe um `ack` só
  na sessão que enviou. Em `INPUT_MODE=SIMULADOR` o comando vai ao simulador; em `CLP`/`REPLAY` **nada é escrito**
  (projeto somente leitura) e o ack volta com `aceito=false`.
- Variáveis de ambiente da aba (opcionais): `WS_TOKEN`, `ELIPSE_ENABLED=true`, `ELIPSE_URL`.
- **Painel de teste:** abra `painel-teste/painel-teste-botoes.html` no navegador, clique em *Conectar ao Node-RED* e em
  *Rodar teste completo*. Teste: `node node-red/tests/spa-websocket.test.js`.

### Rodar no Windows (sem Docker)

Precisa de **Node.js 22.13 ou mais novo** (22 LTS ou 24 LTS, em nodejs.org), por causa do `node:sqlite`.

```bat
npm install -g --unsafe-perm node-red
mkdir %USERPROFILE%\.node-red
cd /d %USERPROFILE%\.node-red
npm install node-red-contrib-s7@3.1.3
copy /Y CAMINHO\DO\REPOSITORIO\grupo1-iot\node-red\settings.js %USERPROFILE%\.node-red\settings.js
set NODE_OPTIONS=--tls-min-v1.3
node-red
```

Abra `http://localhost:1880` → ☰ → **Import** → `node-red/flow_ingestao_n2.json` → **Deploy**.
Configure o servidor do nó **"MQTTS → HiveMQ Cloud (QoS 1)"** como no Passo 2 da Sprint 1
(o client id é `smart40-edge-grupo1-n2`, diferente do fluxo antigo). **Desative a aba antiga** ("Grupo 1 - Telemetria
de Borda") para não publicar em dobro.

Com Docker: `docker compose up -d --build` (a imagem do Node-RED já usa Node 22 e TLS 1.3).

### Testes da Sprint 2

```bat
node node-red\tests\ingestao-n2.test.js
node node-red\tests\edge-logic.test.js
cd iot-service && python -m pytest -q
```

O primeiro testa o fluxo com SQLite real: janela de 500 ms, toque de botão, queda do broker (20 mensagens retidas e
reenviadas em ordem, `buffered: true`), reenvio sem PUBACK, erro no publish, persistência após reinício e replay.
Também foi validado com Node-RED 4.1 e broker MQTT de verdade, derrubando o broker no meio: nenhuma mensagem perdida,
`seq` sem buracos.

### Replay (homologação sem o hardware)

**1. Capturar na bancada** (uma vez, com autorização): na aba, `INPUT_MODE=CLP` e `CAPTURE=true` → Deploy.
Cada leitura de 100 ms vai para `~/.node-red/captures/captura-n2.jsonl`. Opere a bancada alguns minutos (parado,
START, STOP, emergência e reset) e depois volte `CAPTURE=false`. Copie o arquivo para `captures/` do repositório.

**2. Reproduzir sem o hardware:** `INPUT_MODE=REPLAY` → Deploy, e na raiz do repositório:

```bat
node tools\replay-telemetria.js captures\captura-n2.jsonl
```

O script reinjeta as leituras no tempo original e confere: leituras aceitas, nenhuma perdida na agregação, uma
mensagem a cada ~500 ms, `seq` sem buracos, estados iguais aos da captura, tudo gravado na outbox e confirmado pelo
broker. O relatório vai para `docs/evidence/sprint2/G1-replay-AAAA-MM-DD.md`.

Sem captura real ainda, use a de exemplo (`captures/captura-exemplo-SIMULADA.jsonl`, gerada por
`node tools/gerar-captura-exemplo.js`); o resultado sai como **PASS WITH LIMITATION (captura simulada)**.

### Gateway Python (OPC UA)

`gateway-python/` é o gateway em Python (asyncua) com outbox SQLite e simuladores, usado para a leitura OPC UA
(porta 4840) do **S7-1500 da Montagem** (`OPCUA_ENDPOINT=opc.tcp://192.168.150.30:4840`, conforme o manual da planta).
Instruções em `gateway-python/README.md`. Evidências em `docs/evidence/sprint2/img/`.

---

# Sprint 1 (referência)


Protótipo do gateway de borda (Node-RED) e do microsserviço de ingestão (`iot-service`) da
Planta N2 / SMART 4.0.

```
CLP S7-1200 ──S7/100ms──► Node-RED ──JSON──► Buffer offline ──MQTTS 8883──► HiveMQ Cloud
                          (borda)            (store-and-forward)                 │
                                                                                 ▼
                                    Neon Postgres ◄── telemetry_logs ── iot-service (Cloud Run)
```

## Estrutura

```
.
├── node-red/
│   ├── node-red-flow-grupo1.json          ← fluxo principal (S7 100 ms → JSON → buffer → MQTTS)
│   ├── node-red-flow-diagnostico-s7.json  ← diagnóstico ISOLADO da bancada (vem desativado)
│   ├── settings.js · Dockerfile
│   └── tests/edge-logic.test.js
├── iot-service/                           ← microsserviço FastAPI (app.py, testes, Dockerfile)
├── contracts/events/asyncapi-telemetria-grupo1.yaml   ← contrato MQTT versionado
├── db/                                    ← DDL do professor (dono: G3) + proposta 001
├── docs/
│   ├── mapeamento-clp.md                  ← registradores, regra de estado, roteiro de bancada
│   ├── tags/tabela-tags-grupo1.csv        ← planilha de confirmação de tags (formato do runbook)
│   ├── decisions/G1-decisoes-sprint1.md   ← decisões + parecer sobre o OpenAPI
│   ├── contrato-e-divergencias.md
│   └── evidence/sprint1/                  ← evidências (PASS / LIMITATION / BLOCKED)
├── tools/gerar-evidencias.js              ← gera a evidência automática
└── docker-compose.yml
```

## Correspondência com a Sprint 1

| Tarefa (lista do grupo / runbook) | Onde está | Status atual |
|---|---|---|
| 1. Mapeamento do CLP / tabela de tags | `docs/tags/tabela-tags-grupo1.csv`, `docs/mapeamento-clp.md` | A CONFIRMAR na bancada |
| 2. Nó S7 a cada 100 ms → JSON | fluxo principal | PASS WITH LIMITATION (simulador) |
| 3. Store-and-Forward → MQTTS 8883 | fluxo principal | PASS WITH LIMITATION (simulador) |
| 4. `iot-service` gravando no SQL | `iot-service/` | Código e testes prontos; deploy fica para a Sprint 2 |
| 5. Validar no notebook (NotebookLM) | ver seção no final | — |
| Runbook: fluxo de diagnóstico somente leitura | `node-red/node-red-flow-diagnostico-s7.json` | Pronto, desativado |
| Runbook: contrato MQTT versionado | `contracts/events/` | Candidato v1.0.0-rc1 |
| Runbook: decisões e revisão do OpenAPI | `docs/decisions/` | Proposto |
| Runbook: evidências | `docs/evidence/sprint1/` | BLOCKED (hardware) |

**Limites da Sprint 1 (runbook):** somente leitura do CLP, sem acionamento físico, sem deploy de produção e sem DDL
em banco produtivo. Sem acesso ao CLP, o status do grupo é **PASS WITH LIMITATION (mock apenas)**, nunca "CLP validado".

## Versões de referência

| Componente | Versão testada |
|---|---|
| Node-RED | 4.x / 5.x |
| node-red-contrib-s7 | 3.1.3 |
| Node.js | 20 LTS ou 22 LTS |
| Python | 3.12 |

As versões **reais** do PC de vocês ficam registradas em `docs/evidence/sprint1/G1-auto-*.md` (`node tools/gerar-evidencias.js`).

---

## Passo 1 — Rodar o Node-RED no notebook (sem a bancada)

Opção A, **Node-RED instalado direto** (Node.js 18+):

```bash
npm install -g --unsafe-perm node-red
cd ~/.node-red && npm install node-red-contrib-s7
# acrescente o bloco "contextStorage" de node-red/settings.js ao ~/.node-red/settings.js
node-red
```

Opção B, **Docker**: `cp iot-service/.env.example iot-service/.env` e depois `docker compose up -d --build`.

Depois:

1. Abrir `http://localhost:1880` → menu ☰ → **Import** → selecionar `node-red/node-red-flow-grupo1.json` → **Deploy**.
2. A aba **"Grupo 1 - Telemetria de Borda"** já vem com `SIMULATE=true` (dados simulados; o nó S7
   vai mostrar erro de conexão, o que é normal sem o CLP).
3. Clicar nos botões dos injects **SIM: botão START / STOP / EMERGÊNCIA / RESET** e ver o resultado em
   `http://localhost:1880/edge/status`.

## Passo 2 — Configurar o HiveMQ Cloud

1. Criar um cluster gratuito (Serverless) em hivemq.com/cloud.
2. Em **Access Management**, criar **duas** credenciais: `edge-grupo1` (Node-RED) e `iot-service`.
3. No Node-RED, duplo clique no nó **"MQTTS → HiveMQ Cloud"** → lápis do servidor:
   - **Server:** o host do cluster (`xxxx.s1.eu.hivemq.cloud`), **Port:** `8883`, **Use TLS** marcado.
   - Aba **Security:** usuário e senha `edge-grupo1`.
4. Deploy. O nó deve ficar **"connected"** (verde) e o "Buffer Store-and-Forward" deve mostrar **online**.
5. Para ver as mensagens chegando, use o **Web Client** do próprio console do HiveMQ e assine `industria40/#`.

> As credenciais ficam em `flows_cred.json` (criptografado) e **não** são exportadas junto com o fluxo.
> Nunca coloque senha em nó function nem faça commit dela no GitHub.

## Passo 3 — Testar o Store-and-Forward (item 3)

Sem tirar o cabo: clique em **TESTE: forçar OFFLINE**, aperte START/STOP no simulador e aguarde alguns
heartbeats. O nó do buffer mostra `OFFLINE - N msg no buffer`. Clique em **TESTE: voltar ONLINE** e
as mensagens são descarregadas em ordem com `"buffered": true`.

Teste real: desligue o Wi-Fi do notebook por 1 minuto e religue. O buffer usa o contexto `file`, então
também sobrevive a um reinício do Node-RED.

## Passo 4 — Rodar o iot-service (item 4)

```bash
cd iot-service
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env        # preencha DATABASE_URL (Neon), JWT_SECRET, INGEST_API_KEY e MQTT_*
pytest -v                   # 17 testes, não precisam de banco
uvicorn app:app --reload --port 8080
```

Abra `http://localhost:8080/docs` para testar as rotas. Para gerar um token use o
`generate-test-tokens.py` do professor, com o mesmo `JWT_SECRET` do `.env`.

O banco precisa ter o `init-db-industria40.sql` aplicado (Grupo 3). Recomendamos também a migração:

```bash
psql "$DATABASE_URL" -f db/001_telemetry_msg_id.sql
```

### Deploy no Cloud Run (Sprint 2 — fora do escopo do Marco 1)

O runbook da Sprint 1 não inclui deploy. Os comandos ficam aqui para quando a turma liberar.


```bash
cd iot-service
gcloud run deploy iot-service --source . --region us-central1 \
  --min-instances=1 --max-instances=1 --no-cpu-throttling --allow-unauthenticated \
  --set-env-vars "AUTH_ENABLED=true,MQTT_SUBSCRIBE=true,MQTT_HOST=xxxx.s1.eu.hivemq.cloud,MQTT_PORT=8883,MQTT_USER=iot-service" \
  --set-secrets "DATABASE_URL=database-url:latest,JWT_SECRET=jwt-secret:latest,MQTT_PASSWORD=mqtt-password:latest,INGEST_API_KEY=ingest-key:latest"
```

Por que essas flags:

- **`--min-instances=1 --no-cpu-throttling`**: o assinante MQTT precisa de um processo sempre ativo, e
  o Cloud Run normalmente desliga a instância sem requisições HTTP. **Isso sai do plano gratuito se
  ficar ligado 24 h/dia.** Fora do horário do laboratório, use `gcloud run services update iot-service --min-instances=0`.
  Enquanto o serviço estiver parado, o HiveMQ guarda as mensagens na sessão persistente (dentro dos limites do plano).
- **`--max-instances=1`**: duas instâncias com o mesmo `MQTT_CLIENT_ID` ficariam derrubando uma à outra.
- Alternativa sem instância fixa: a borda chamar `POST /api/v1/telemetry/ingest` por HTTP. A rota já
  existe; vale decidir com o professor e o Grupo 5 qual caminho será o oficial.

## Testes automatizados

```bash
node node-red/tests/edge-logic.test.js       # lógica do fluxo (simulador, JSON, buffer, reconexão)
cd iot-service && pytest -v                  # API, RBAC, deduplicação
```

Também foi verificado que os payloads gerados pelo fluxo passam no schema do contrato AsyncAPI.
O protótipo também foi validado ponta a ponta (Node-RED real → broker → iot-service → PostgreSQL com o
DDL do professor), com queda do broker no meio: as 14 mensagens chegaram em sequência, sem buracos e sem
duplicatas. Os 3 testes do Grupo 1 em `test_integration.py` do professor passam contra o serviço.

## Gerar evidências da Sprint 1

```bash
node tools/gerar-evidencias.js
```

Gera `docs/evidence/sprint1/G1-auto-AAAA-MM-DD.md` com versões, resultado dos testes e duas checagens de segurança:
nenhum nó de escrita no CLP e nenhum segredo versionado. Termina com código de erro se algo falhar.

## Levando para a bancada

**Primeiro o diagnóstico isolado**, depois o fluxo principal:

1. Importar `node-red/node-red-flow-diagnostico-s7.json` (aba "G1 - Diagnóstico S7", vem desativada).
2. Seguir `docs/evidence/sprint1/G1-sessao-bancada-TEMPLATE.md`: teste de porta 102, ativar a aba, **LER SNAPSHOT AGORA**,
   baixar `http://localhost:1880/diag/s7.csv` e comparar com a watch table do TIA.
3. Desativar a aba de diagnóstico ao terminar.

Depois, no fluxo principal:


1. Notebook na rede `192.168.150.x` do laboratório, com autorização do responsável.
2. Na aba do fluxo: `SIMULATE = false` → Deploy.
3. Se aparecer erro de timeout no nó S7, suba o ciclo de 100 para 200 ms (é o valor usado pelo fluxo da bancada).

**Segurança:** este fluxo apenas **lê** o CLP. Comandos remotos (Start/Stop pela web) ficam para a
Sprint 3 e nunca substituem a emergência física.

## Item 5 — Validar no notebook (NotebookLM)

Envie para o Google Drive e adicione como fontes: `node-red/node-red-flow-grupo1.json`,
`iot-service/app.py`, `contracts/events/asyncapi-telemetria-grupo1.yaml`, `docs/mapeamento-clp.md`
e `docs/decisions/G1-decisoes-sprint1.md`. Se a plataforma recusar `.json` ou `.py`,
renomeie a cópia para `.txt`.

## Pendências com o professor e outros grupos

Detalhes em `docs/contrato-e-divergencias.md`. Resumo:

- Não existe registrador de **velocidade da esteira** nem de **Reset** no CLP mapeado.
- O formato de status difere entre OpenAPI, banco e `test_integration.py`.
- Há três `JWT_SECRET` diferentes nos arquivos-base (Grupo 5).
- `db-connection.py` usa colunas que não existem em `telemetry_logs` (Grupo 3).
- Proposta de índice único em `msg_id` para não duplicar dados após reconexão (Grupo 3).
