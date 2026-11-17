# Evidências — Grupo 1 — Sprint 3 (ponte borda-nuvem)

Resultados possíveis: **PASS / PASS WITH LIMITATION / BLOCKED / FAIL**. Nenhuma etapa conta como concluída sem evidência.
Nada aqui pode conter token, senha, URL com `?token=` ou print com credencial.

## Situação em 17/11/2026 (início da Semana 6)

| # | Item | Evidência | Resultado |
|---|---|---|---|
| 1 | Auditoria do fluxo (passos 1–4) | `G1-S3-auditoria-semana6.md` | PASS no código · itens de bancada a conferir |
| 2 | Pré-requisitos herdados da Sprint 2 | `G1-S3-prerequisitos.md` | BLOCKED em 4 itens (ver arquivo) |
| 3 | Testes automáticos (fluxo, comandos, ponte) | `node node-red/tests/ponte-wss.test.js` e os outros 3 | PASS |
| 4 | Ensaio local (Node-RED real + broker wss de ensaio) | `G1-S3-ensaio-local-2026-11-17.md` | PASS (ensaio, não é homologação) |
| 5 | Teste A — conectividade com o broker real | `log_testes_ponte_g1.md` | a executar (falta token do G5) |
| 6 | Teste B — payload sintético na bancada | `log_testes_ponte_g1.md` | a executar |
| 7 | Teste C — SPA do G4 recebendo a cada 500 ms | `log_testes_ponte_g1.md` + print do console | a executar (janela com o G4) |
| 8 | Resiliência — cabo da bancada fora por 2 min | `log_testes_ponte_g1.md` + `G1-S3-relatorio-resiliencia.md` | a executar |
| 9 | Canal de comandos (whitelist, E-Stop, node.warn) | `log_testes_ponte_g1.md` + print de `/edge/comandos` | a executar no broker real |
| 10 | Escrita no CLP | `G1-S3-autorizacao-escrita-clp.md` | **BLOCKED** até autorização escrita |
| 11 | Continuidade 30 min (Portão 3) | `log_testes_ponte_g1.md` | a executar |
| 12 | Nenhum segredo (inclui histórico) | `node tools/verificar-segredos.js --historico` | PASS nos arquivos · rodar no clone com `.git` |
| 13 | Envelope conforme contrato (G5) | `contracts/events/` + PR para o G5 | aguardando aprovação do G5 |
| 14 | Janelas de teste com o G4 | `G1-S3-ata-janelas-G4.md` | a preencher |
| 15 | Resultado consolidado e ata de aceite | `G1-S3-ata-aceite.md` | ao final da Semana 8 |

Atualize esta tabela a cada evidência nova (data, versão = commit, resultado).
