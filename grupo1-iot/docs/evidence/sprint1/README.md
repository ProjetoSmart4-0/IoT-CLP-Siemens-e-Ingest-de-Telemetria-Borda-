# Evidências — Grupo 1 — Sprint 1

Pasta exigida pela "Definition of Done" do runbook. **Nada aqui pode conter senha, token, URL do banco ou
credencial do HiveMQ.** Ao tirar prints, oculte o que não for necessário.

## Status do Grupo 1 (atualizar a cada execução)

| ID | Item do runbook | Status | Evidência |
|---|---|---|---|
| G1-01 | Node-RED + driver S7 instalados, versões registradas | ☐ | `G1-auto-AAAA-MM-DD.md` |
| G1-02 | Conectividade TCP/102 até o CLP | ⛔ BLOCKED | `G1-bloqueio-hardware.md` |
| G1-03 | Leitura S7 comparada com a watch table do TIA | ⛔ BLOCKED | `G1-bloqueio-hardware.md` |
| G1-04 | Tabela de tags confirmada pelo responsável | ⛔ BLOCKED | `docs/tags/tabela-tags-grupo1.csv` |
| G1-05 | Fluxos somente leitura e sem credenciais | ☐ | `G1-auto-AAAA-MM-DD.md` |
| G1-06 | Mock/simulador + testes automatizados | ☐ | `G1-auto-AAAA-MM-DD.md` + print do `/edge/status` |
| G1-07 | Parecer sobre o OpenAPI e contrato de eventos | ☐ | `docs/decisions/G1-decisoes-sprint1.md`, `contracts/events/` |
| G1-08 | Nenhum segredo versionado | ☐ | `G1-auto-AAAA-MM-DD.md` |

**Status geral esperado sem acesso ao CLP: PASS WITH LIMITATION (mock apenas)** — nunca "CLP validado".
Status permitidos: PASS, PASS WITH LIMITATION, BLOCKED, FAIL.

## Como gerar

1. Na raiz do repositório: `node tools/gerar-evidencias.js` → cria `G1-auto-AAAA-MM-DD.md` (G1-01, 05, 06, 08).
2. Print do `http://localhost:1880/edge/status` com o simulador rodando → `img/G1-06-edge-status.png`.
3. Na bancada: seguir `G1-sessao-bancada-TEMPLATE.md` (copiar com a data no nome).

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `G1-auto-*.md` | Gerado pelo script: versões, testes, checagens de segurança |
| `G1-bloqueio-hardware.md` | Registro formal do bloqueio (sem acesso ao CLP) |
| `G1-sessao-bancada-TEMPLATE.md` | Roteiro e formulário da sessão na bancada |
| `G1-leitura-s7-*.csv` | Snapshot baixado de `http://localhost:1880/diag/s7.csv` |
| `img/` | Prints, com segredos e IPs ocultados quando não forem necessários |
