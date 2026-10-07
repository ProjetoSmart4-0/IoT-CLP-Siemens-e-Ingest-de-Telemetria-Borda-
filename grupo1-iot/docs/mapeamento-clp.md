# Mapeamento do CLP Siemens S7-1200 — Grupo 1 (Sprint 1, item 1)

Fonte: tabela de variáveis do `flows.json` que já roda na bancada (aba **ESTOQUE**), nó `s7 endpoint`.
Os endereços abaixo **existem no CLP**; o que precisa ser validado na bancada é o **significado**
de cada bit (coluna "Validado").

## Conexão

| Parâmetro | Valor |
|---|---|
| IP do CLP | `192.168.150.10` |
| Porta / transporte | `102` / ISO-on-TCP |
| Rack / Slot | `0` / `1` |
| Ciclo de leitura | `100 ms` (o fluxo da bancada usa 200 ms) |

Pré-requisitos no TIA Portal (provavelmente já feitos, pois o fluxo da bancada funciona):
"Permit access with PUT/GET" habilitado na CPU e "Optimized block access" **desligado** nos DBs 9, 101, 102 e 103.

## Sinais exigidos pela tarefa

| Sinal | Variável | Endereço | Tipo | Validado? |
|---|---|---|---|---|
| **Start** (estação Processo) | `processo_botaoVerde` | `DB101,X0.7` | Bool | ☐ |
| **Start** (estação Montagem) | `montagem_botaoVerde` | `DB102,X6.6` | Bool | ☐ |
| **Start** (estação Expedição) | `expedicao_botaoVerde` | `DB103,X0.6` | Bool | ☐ |
| **Stop** (Processo) | `processo_botaoVermelho` | `DB101,X1.0` | Bool | ☐ |
| **Stop** (Montagem) | `montagem_botaoVermelho` | `DB102,X6.7` | Bool | ☐ |
| **Stop** (Expedição) | `expedicao_botaoVermelho` | `DB103,X0.7` | Bool | ☐ |
| **Emergência** | `emergencia` | `DB9,X100.3` | Bool | ☐ |
| **Emergência (ativada/travada)** | `emergenciaAtivada` | `DB9,X110.0` | Bool | ☐ |
| **Esteira 1 / 2 – Processo** | `processo_esteira1/2` | `DB101,X20.3` / `X20.4` | Bool | ☐ |
| **Esteira 1 / 2 – Montagem** | `montagem_esteira1/2` | `DB102,X30.3` / `X30.4` | Bool | ☐ |
| **Esteira 1 / 2 – Expedição** | `expedicao_esteira1/2` | `DB103,X20.2` / `X20.3` | Bool | ☐ |
| **Velocidade da esteira** | — | **NÃO EXISTE no mapa** | — | ☐ |
| **Reset** | — | **NÃO EXISTE no mapa** | — | ☐ |

## Sinais complementares lidos (contexto de estado)

| Variável | Endereço | Uso no JSON |
|---|---|---|
| `processo/montagem/expedicao_segurancaOK` | `DB101,X0.1` · `DB102,X0.1` · `DB103,X0.1` | `stations.*.seguranca_ok` → estado `ALARM` |
| `processo/montagem/expedicao_chaveAutomatico` | `DB101,X0.6` · `DB102,X6.5` · `DB103,X0.5` | `stations.*.automatico` |
| `ocupado` / `aguardando` / `manual` | `DB9,X100.0` / `X100.1` / `X100.2` | `flags.*` |
| `comutadorAutomatico` / `condicaoIniciar` | `DB9,X110.1` / `X110.6` | `flags.*` |
| `numeroOP` | `DB9,I96` | `numero_op` |

## ⚠️ Pendências para levar ao professor

1. **Velocidade da esteira:** as esteiras aparecem só como bits liga/desliga (provavelmente saídas
   para contatores, não um inversor). Perguntar se existe inversor/encoder com valor analógico
   (ex.: um `DBx,REAL` ou `IW`). Enquanto isso, o fluxo publica `belt_speed: null` com
   `belt_speed_source: "UNAVAILABLE"`, ou um valor nominal se `BELT_NOMINAL_SPEED` for configurado.
2. **Botão Reset:** o painel tem um botão azul (foto da bancada) que não está na tabela. Precisamos do endereço.
3. **Bits de esteira (`X20.x`/`X30.x`)** ficam na área de comandos de cada DB: indicam que o CLP
   *mandou* ligar, não que a esteira *está* girando. Confirmar se existe sensor de retorno.
4. **Botões por estação:** cada estação tem seu par verde/vermelho. Assumimos "qualquer estação" = botão pressionado.

## Regra de `machine_state` (HIPÓTESE — validar na bancada)

Mapeada para o ENUM do banco (`STOPPED, RUNNING, PAUSED, EMERGENCY, ALARM`), em ordem de prioridade:

1. `emergencia` OU `emergenciaAtivada` → **EMERGENCY**
2. alguma estação com `segurancaOK = false` → **ALARM**
3. alguma esteira ligada OU `ocupado` → **RUNNING**
4. `manual` → **PAUSED**
5. caso contrário → **STOPPED**

Se a bancada mostrar outro comportamento (ex.: `segurancaOK` fica falso com a estação desligada),
ajustar no nó **"Normaliza CLP → JSON"**.

## Roteiro de validação na bancada (≈30 min)

1. No Node-RED, aba do Grupo 1 → duplo clique na aba → `SIMULATE = false` → Deploy.
2. Abrir `http://localhost:1880/edge/status` (ou ativar o debug "Telemetria publicada").
3. Apertar cada botão e conferir se o campo correspondente muda; marcar ☑ na tabela acima.
4. Ligar/desligar a esteira pela IHM física e conferir `belt_running` e `stations.*.esteiraN`.
5. Acionar a emergência e conferir `machine_state = EMERGENCY` (e voltar ao normal após reset físico).

**Segurança:** o fluxo do Grupo 1 é **somente leitura** (não há nenhum nó `s7 out`). Não acrescentar
escrita no CLP nesta sprint. A emergência física continua atuando direto no hardware.
