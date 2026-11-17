# Ata de aceite — Grupo 1 — Sprint 3

| Critério de aceite (roteiro, seção 8) | Evidência | Resultado |
|---|---|---|
| [PORTÃO 3] Telemetria no broker a cada 500 ms por ≥ 30 min contínuos | log (continuidade) | |
| [PORTÃO 3] Zero perda em queda de link, replay ordenado | log (resiliência) + relatório | |
| Comandos validados por origem; rejeição via `node.warn` | log (comandos) + print `/edge/comandos` | |
| EMERGENCY_STOP bypassa a whitelist | log (comandos) | |
| Nenhum segredo no repositório (com histórico) | `verificar-segredos.js --historico` | |
| Escrita no CLP só com autorização escrita anexada | `G1-S3-autorizacao-escrita-clp.md` | |
| Envelope conforme contrato aprovado pelo G5 | PR de aprovação | |

**Resultado consolidado da Sprint 3:** ☐ PASS ☐ PASS WITH LIMITATION ☐ BLOCKED ☐ FAIL

O grupo declara que todas as evidências foram arquivadas em `docs/evidence/sprint3/` com data, versão e resultado,
e que nenhum segredo foi exposto em repositório, screenshot ou export.

Integrantes: ________________________________________ Data: ____/____/2026
