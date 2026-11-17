# Decisões do Grupo 1 — Sprint 3

Status: PROPOSTA até aprovação dos grupos indicados.

| ID | Decisão | Aprovadores | Status |
|---|---|---|---|
| D-G1-12 | Cliente WSS no nó function com WebSocket nativo do Node.js | G1, docente | PROPOSTA |
| D-G1-13 | Bloco `meta` no envelope (msg_id, seq, boot, stale, buffered) | G1, G4, G5 | PROPOSTA |
| D-G1-14 | Confirmação de entrega no WSS (GRACE ou ECHO) | G1, G5 | PROPOSTA |
| D-G1-15 | Escrita no CLP com trava dupla + auditoria | G1, resp. automação | PROPOSTA |
| D-G1-16 | `INPUT_MODE=TESTE_B` no lugar de editar o fio do `s7 in` | G1 | PROPOSTA |
| D-G1-17 | Divergências de endereço (IP `.30` × `.10`, DB1) | G1, resp. automação | ABERTA |
| D-G1-18 | Fluxo consolidado em um arquivo com 3 abas | G1 | PROPOSTA |

## D-G1-12 — Cliente WSS sem `node-red-contrib-websocket-client`

O roteiro pede reconexão a cada **5000 ms**. O nó `websocket client` do Node-RED 4 reconecta em **3000 ms fixos**
(valor no código do nó, sem opção) e não avisa se a mensagem saiu do socket. O pacote `node-red-contrib-websocket-client`
está na versão 0.0.4, sem atualização desde 2023. Por isso o nó "Ponte: cliente WSS" usa o `WebSocket` nativo do
Node.js 22 (exposto pelo `settings.js`) e controla: reconexão de 5000 ms (medida em teste), código 4001, guarda contra
`ws://`/Vercel/token na URL, e confirmação de entrega pela outbox.
Achado do ensaio: no Node.js 22, conexão recusada dispara só `error`, sem `close`; o cliente trata isso como queda (1006).

## D-G1-13 — Bloco `meta` no envelope

O contrato tem `timestamp, roboUR, esteira, estacoes, pedidoAtual`. Para cumprir "replay sem lacunas e sem duplicidade"
o consumidor precisa de identidade e ordem. Acrescentamos, sem mudar os campos existentes:
`meta.msg_id` (deduplicação), `meta.seq` + `meta.boot` (lacunas; `seq` recomeça a cada reinício), `meta.stale`
(janela sem leitura nova: último valor bom, roteiro 6.4), `meta.buffered`/`meta.reenvio` (veio da outbox),
`meta.origem_dados` (PLC, SIMULATOR, REPLAY, TESTE_B). Exige aprovação do G5 (contrato) e ciência do G4.

## D-G1-14 — Confirmação de entrega no WSS ("QoS 1")

WebSocket não tem PUBACK. Modo padrão `GRACE`: frame vira `SENT` depois de 1 s na mesma conexão aberta e com o buffer
de saída vazio; se a conexão cair, tudo que estava em voo volta para a fila e sai de novo em ordem. Resultado: entrega
"pelo menos uma vez", duplicatas só de reenvio, deduplicáveis por `msg_id`. Modo `ECHO`: confirma quando o broker
devolve o próprio frame (se o broker real fizer eco). **Perguntar ao G5** se o broker ecoa ou guarda histórico.

## D-G1-15 — Escrita no CLP

Comandos `START/STOP/RESET/EMERGENCY_STOP` viram pulso TRUE → FALSE (500 ms) em `DB1,X0.4..X0.7`, num endpoint S7
separado do de leitura. Só acontece com `INPUT_MODE=CLP` **e** `CLP_WRITE_AUTHORIZED=true` **e** `CLP_WRITE_AUTH_REF`
apontando para a autorização assinada. Todo comando (aceito ou não) vai para `audit_comandos`.
Limitação conhecida: a `origem` é declarada por quem envia; o ideal é o broker carimbar a origem a partir do token
(levar ao G5). O E-Stop por software não é função de segurança: a emergência física prevalece (NR-12).

## D-G1-16 — Teste B

Em vez de desligar o `s7 in` e religar um `inject` à mão, a aba tem o modo `TESTE_B`: um `inject` com o JSON exato do
roteiro entra no lugar da leitura do CLP. Mapeamento: `emergenciaEstoque` → emergência, `motorEsteira1` → esteira
ligada, `posEstoque` → `estacoes.estoque.magazine`, `statusEstoqueOk=false` → ALARM. Mapeamento de `posEstoque` é
hipótese (posição × contagem do magazine) a confirmar com o G5.

## D-G1-17 — Divergências de endereço (abertas)

1. O roteiro (pág. 1) cita "S7-1200 CPU 1215C IP 192.168.150.30"; o contexto do projeto e o manual da planta indicam
   `.30` = S7-1500 da Montagem e `.10` = S7-1200 do Estoque. O fluxo usa `.10`. Confirmar.
2. `DB1,X0.0..X0.2` (leitura) e `DB1,X0.4..X0.7` (comandos) do roteiro não aparecem no fluxo da bancada (que usa DB9 e
   DB101–103). Confirmar no TIA Portal se o DB1 existe, com acesso otimizado desligado.
3. `DB1,INT2` (velocidade) também não existe no mapa atual; `belt_speed` segue `UNAVAILABLE`.

## D-G1-18 — Fluxo consolidado

`node-red/flow_ingestao_n2.json` passa a ter as 3 abas (o `flow_spa_websocket.json` da Sprint 2 foi incorporado).
Um único import na bancada, sem IDs duplicados. `packages/agente-local/node-red/flows.json` é a cópia versionada.
