# Ata das janelas de teste com o Grupo 4 — entregável 17

| Campo | Valor |
|---|---|
| Data da reunião | |
| Participantes G1 | |
| Participantes G4 | |

## Janelas acordadas

| Janela (data e horário) | Fonte de dados | Objetivo | Responsável G1 | Responsável G4 |
|---|---|---|---|---|
| | bancada (`INPUT_MODE=CLP`) | Teste C na SPA + Portão 3 | | |
| | replay (`INPUT_MODE=REPLAY`) | Homologação sem hardware | | |
| | simulador | Teste de comandos pela SPA | | |

## Acordos

- Schema do payload: envelope `envelope-telemetria-1.0` (`contracts/events/envelope-ponte-wss.schema.json`); deduplicação por `meta.msg_id`.
- Divergência de schema encontrada pelo G4: corrigida pelo G1 em até 24 h (Semana 8), com PR e confirmação do G4.
- Canal de status: em caso de falha na janela, avisar em ________.

## Assinaturas

G1: ________________________  G4: ________________________
