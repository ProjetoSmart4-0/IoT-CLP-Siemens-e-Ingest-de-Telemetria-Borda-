# Decisões do Grupo 1 — Sprint 1

Propostas do Grupo 1 para fechar antes do congelamento dos contratos (runbook, seção 1, "Decisões a fechar").
Cada decisão precisa da aprovação dos grupos indicados. Atualize o **Status** e a **Data** quando aprovada.

| ID | Decisão | Aprovadores | Status |
|---|---|---|---|
| D-G1-01 | Segurança ≠ Emergência | G1, G3, G5, docente | PROPOSTA |
| D-G1-02 | Unidade de `belt_speed` | G1, G3, G4, G5 | PROPOSTA |
| D-G1-03 | `machine_state` e `timestamp` | G1, G3, G4, G5 | PROPOSTA |
| D-G1-04 | Contrato de eventos MQTT | G1, G3, G4, G5 | PROPOSTA |
| D-G1-05 | Idempotência da telemetria (`msg_id`) | G1, G3 | PROPOSTA |
| D-G1-06 | Comandos remotos fora da Sprint 1 | G1, G4, G5, docente | PROPOSTA |

---

## D-G1-01 — Segurança ≠ Emergência

**Contexto.** O guia cita os botões "Segurança" e "Emergência"; o DDL só tem `emergency_pressed`.

**O que o mapa do CLP mostra.** São sinais diferentes:
- Emergência: `emergencia` (`DB9,X100.3`) e `emergenciaAtivada` (`DB9,X110.0`), globais.
- Segurança: `segurancaOK` por estação (`DB101,X0.1`, `DB102,X0.1`, `DB103,X0.1`).

**Proposta.** Manter `emergency_pressed` = `emergencia OR emergenciaAtivada`. Segurança **não** ganha coluna nova
nesta sprint: vai em `raw_payload.stations.*.seguranca_ok` e, quando falsa, leva o `machine_state` a `ALARM`.
Se o G3 preferir consulta direta, a alternativa é uma coluna `safety_ok BOOLEAN` (migração simples).

**Pendente na bancada.** Confirmar o que `segurancaOK` representa fisicamente (porta, cortina, chave) e a diferença
entre os dois bits de emergência.

## D-G1-02 — Unidade de `belt_speed`

**Contexto.** O OpenAPI usa m/s (`conveyor_speed_m_s`), o DDL diz "mm/s ou m/min" e o fluxo-base do professor usa rpm.
**O CLP mapeado não tem tag de velocidade**: as esteiras são bits liga/desliga.

**Proposta.** Unidade **mm/s**, coluna atual `NUMERIC(5,2)` (0–999,99 mm/s, resolução 0,01 mm/s). Em m/s, a mesma coluna
teria resolução de só 10 mm/s. Renomear o campo do OpenAPI para `conveyor_speed_mm_s`.
Enquanto não houver tag real: `belt_speed = null` e `belt_speed_source = "UNAVAILABLE"` (nunca inventar valor).

## D-G1-03 — `machine_state` e `timestamp`

**Proposta.**
- Enum único em todo o sistema = o do banco: `STOPPED, RUNNING, PAUSED, EMERGENCY, ALARM`.
  O OpenAPI deve trocar `EMERGENCY_STOP` por `EMERGENCY` e incluir `PAUSED`.
- Regra de derivação na borda, por prioridade: EMERGENCY > ALARM > RUNNING > PAUSED > STOPPED
  (detalhes em `docs/mapeamento-clp.md`). É hipótese até a validação na bancada.
- `timestamp`: UTC ISO-8601 com `Z`, gerado pelo relógio do PC de borda **no momento da leitura**.
  Mensagens reenviadas pelo buffer mantêm o horário original. Recomendação: PC de borda com NTP ativo.

## D-G1-04 — Contrato de eventos MQTT

**Proposta.** `contracts/events/asyncapi-telemetria-grupo1.yaml` (AsyncAPI 2.6, validado sem erros):

| Tópico | Direção | QoS | Retain | Versão |
|---|---|---|---|---|
| `industria40/telemetry/data` | borda → nuvem | 1 | não | `schema_version` 1.0 |
| `industria40/edge/status` | borda → nuvem (birth/last-will) | 1 | sim | — |
| `industria40/telemetry/commands` | nuvem → borda | 1 | não | reservado (Sprint 3) |

Reconexão: o Node-RED reconecta sozinho; durante a queda, o buffer guarda as mensagens em disco e reenvia em ordem.
Autenticação: usuário/senha por cliente no HiveMQ, TLS 8883.

## D-G1-05 — Idempotência (`msg_id`)

**Proposta.** Toda mensagem leva `msg_id` único gerado na borda; o `iot-service` ignora repetições.
Para garantia forte no banco, índice único proposto ao G3 em `db/001_telemetry_msg_id.sql`
(não altera colunas). Necessário para o teste de queda de rede da Semana 8.

## D-G1-06 — Comandos remotos fora da Sprint 1

**Proposta.** Na Sprint 1, a borda é **somente leitura** (sem `s7 out`). `POST /telemetry/commands` existe apenas como
stub (valida, registra, responde 202) e a borda não assina o tópico de comandos.
Propomos também **retirar `EMERGENCY_STOP` dos comandos remotos**: emergência é função do circuito físico; um botão web
pode no máximo pedir uma parada normal (STOP).

---

## Parecer do G1 sobre `openapi-spec.yaml` (módulo Telemetria)

Para o Grupo 5 registrar na revisão do contrato (runbook, Dia 2). Status do parecer: **APROVADO COM RESSALVAS**.

| # | Rota / schema | Achado | Pedido |
|---|---|---|---|
| 1 | `MachineTelemetry.system_status` | Enum diverge do banco | Usar o enum do banco (D-G1-03) |
| 2 | `MachineTelemetry.buttons` | Falta `reset_pressed` e informação de segurança | Incluir `reset_pressed` e `safety_ok` |
| 3 | `conveyor_speed_m_s` | Unidade em aberto; CLP sem tag | Renomear para `conveyor_speed_mm_s`, tipo `number`, `nullable: true` (D-G1-02) |
| 4 | `MachineTelemetry` | Nenhum campo `required`, sem `machine_id` | Marcar `timestamp`, `machine_state`, `buttons` como required; incluir `machine_id` |
| 5 | `MachineTelemetry` | Sem indicação de borda desconectada | Incluir `edge_online` (boolean) e `age_seconds` (para o G4 exibir DESCONECTADO) |
| 6 | `GET /telemetry/status` | Só documenta 200 | Incluir 401, 403 e 404 (sem telemetria ainda) |
| 7 | `POST /telemetry/commands` | Responde 200, mas a execução é assíncrona | Usar **202 Accepted**; incluir 401, 403 (MANAGER) e 422 |
| 8 | `MachineCommand.command` | `EMERGENCY_STOP` como comando remoto | Retirar (D-G1-06) |
| 9 | — | Não há rota de ingestão nem histórico | Incluir `POST /telemetry/ingest` (X-API-Key, só borda/bridge) e `GET /telemetry/history` |
| 10 | Segurança | 401 × 403 | 401 = sem token / expirado / assinatura inválida; 403 = papel sem permissão (RFC 9110) |

Matriz RBAC proposta para as rotas do G1:

| Rota | OPERATOR | ENGINEER | MANAGER | ADMIN |
|---|---|---|---|---|
| `GET /telemetry/status` | ✅ | ✅ | ✅ | ✅ |
| `GET /telemetry/history` | ✅ | ✅ | ✅ | ✅ |
| `POST /telemetry/commands` | ✅ | ✅ | ❌ 403 | ✅ |
| `POST /telemetry/ingest` | — (X-API-Key da borda, não usa JWT) | | | |
