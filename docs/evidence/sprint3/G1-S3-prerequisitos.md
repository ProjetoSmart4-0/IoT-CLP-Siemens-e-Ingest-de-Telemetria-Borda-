# Verificação dos pré-requisitos herdados da Sprint 2 (antes da Semana 6)

Regra do roteiro: item não atendido = **BLOCKED**, com responsável e prazo.

| Pré-requisito | Situação na entrega da Sprint 2 | Resultado | Responsável | Prazo |
|---|---|---|---|---|
| Fluxo com polling a 100 ms no notebook da bancada | Fluxo pronto e testado no simulador; CLP real "PASS WITH LIMITATION" | PASS WITH LIMITATION | G1 | 1ª sessão de bancada |
| `inventario_mapa_tags_n2.xlsx` aprovado pelo responsável da automação | Endereços "A CONFIRMAR" no TIA Portal v17 | **BLOCKED** | G1 + resp. automação | Semana 6 |
| SQLite Outbox `outbox_telemetry` em store-and-forward | Testado (incluindo queda real de broker MQTT) | PASS | G1 | — |
| iot-service no Cloud Run, acessível pelo proxy da Vercel | Código e testes prontos; deploy pendente | **BLOCKED** | G1 (deploy) + G4 (rewrite `/api/iot/*`) | Semana 6 |
| Replay telemétrico validado com o G4 | Script pronto; só captura simulada; sem sessão com o G4 | **BLOCKED** | G1 + G4 | Semana 7 |
| Token do agente emitido pelo G5 e funcional no broker | Não há registro de emissão | **BLOCKED** | G5 | Semana 6 |

Preencher a coluna "Prazo" com a data combinada e registrar a resolução aqui.
