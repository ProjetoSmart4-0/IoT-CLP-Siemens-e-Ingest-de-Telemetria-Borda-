# Sessão na bancada — Grupo 1 — AAAA-MM-DD

Copie este arquivo como `G1-sessao-bancada-AAAA-MM-DD.md` e preencha **durante** a sessão.

| Campo | Valor |
|---|---|
| Autorizado por (nome/cargo) | |
| Presentes | |
| PC de borda (SO) | |
| CPU / firmware | |
| Driver S7 / versão | node-red-contrib-s7 ____ |

## Regras (confirmar antes de começar)

- [ ] Só leitura: nenhum `s7 out`, nenhuma alteração no TIA/CPU, nenhum STOP/RUN.
- [ ] Não acionar a emergência para testar; ler o estado como está.
- [ ] Notebook na rede local da bancada; nada exposto à internet.

## 1. Conectividade (G1-02)

```powershell
Test-NetConnection 192.168.150.10 -Port 102
```
Resultado `TcpTestSucceeded`: ☐ True ☐ False  → Status: ____

## 2. Leitura S7 (G1-03)

1. No Node-RED: aba "G1 - Diagnóstico S7" → duplo clique → **Enabled** → Deploy.
2. Conferir o status do nó "DIAG CLP": ☐ online ☐ erro: ________
3. Clicar em **LER SNAPSHOT AGORA** → conferir no painel Debug.
4. Baixar `http://localhost:1880/diag/s7.csv` e salvar nesta pasta.
5. Preencher a coluna `valor_tia` do CSV com a watch table do TIA e marcar `confere`.

Tags lidas: ____ / 28 → Status: ____

## 3. Teste de significado (G1-04) — só ações autorizadas pelo responsável

| Ação na bancada | Tag esperada | Mudou? |
|---|---|---|
| Apertar botão verde (Processo) | `processo_botaoVerde` | ☐ |
| Apertar botão vermelho (Processo) | `processo_botaoVermelho` | ☐ |
| (repetir para Montagem e Expedição) | | ☐ |
| Ligar esteira pela IHM física | `*_esteira1/2` | ☐ |
| Peça no stopper | `*_pecaStopper` | ☐ |
| Botão azul (Reset?) | descobrir | ☐ |

Atualizar `docs/tags/tabela-tags-grupo1.csv`: status `CONFIRMADO`, `confirmado_por`, `data`.

## 4. Encerramento

- [ ] Aba de diagnóstico **desativada** e Deploy feito.
- [ ] Export do fluxo sem credenciais.
- [ ] Assinatura do responsável: ____________

Status final da sessão: ☐ PASS ☐ PASS WITH LIMITATION ☐ BLOCKED ☐ FAIL
