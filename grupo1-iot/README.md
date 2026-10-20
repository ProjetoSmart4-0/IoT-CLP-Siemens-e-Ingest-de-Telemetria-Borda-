# Grupo 1 — IoT, CLP Siemens & Ingestão de Telemetria (Borda) · Sprint 1

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
