# Log diário de execução e contingências — Grupo 1 · Sprint 3

Conferir no início e no fim de cada dia (roteiro 6.4). Desvio = registrar aqui e na evidência correspondente.

## Semana 6 (preparação e contratos)

| Dia | Foco | Resultado / desvio |
|---|---|---|
| Seg 16/11 | Início da sprint; leitura do roteiro | |
| Ter 17/11 | Implementação da ponte WSS, canal de comandos, testes e ensaio local | PASS (ensaio local) · pré-requisitos com 4 BLOCKED |
| Qua 18/11 | | |
| Qui 19/11 | | |
| Sex 20/11 | | |

## Semana 7 (implementação e integração) · Semana 8 (Portão 3)

Copiar a tabela acima para cada semana.

## Contingências acionadas (roteiro 6.5)

| Data/hora | Cenário | Resposta | Resultado (PASS WITH LIMITATION / FAIL) |
|---|---|---|---|
| | Broker em cold start no Render | reconexão automática a cada 5000 ms; medir latência da 1ª conexão | |
| | Queda de link com a bancada | outbox retém e reenvia em ordem | |
| | Divergência de schema com o G4 | correção em até 24 h | |
| | Token do agente expirado (4001) | pedir novo token ao G5; status do nó mostra "TOKEN RECUSADO (4001)" | |
