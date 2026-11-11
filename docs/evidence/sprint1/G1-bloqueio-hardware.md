# Registro de bloqueio — hardware (Grupo 1)

| Campo | Valor |
|---|---|
| Itens afetados | G1-02 (TCP/102), G1-03 (leitura S7 × TIA), G1-04 (tabela de tags confirmada) |
| Status | ⛔ BLOCKED |
| Aberto em | AAAA-MM-DD |
| Motivo | Grupo sem acesso autorizado ao CLP S7-1200 da Planta N2 |
| Responsável pelo desbloqueio | Docente / responsável da automação: ____________ |
| Responsável no G1 | ____________ |
| Próxima ação | Agendar sessão na bancada; receber autorização e a tabela oficial de tags |
| Prazo pedido | ____________ |

## O que foi feito enquanto isso (PASS WITH LIMITATION)

- Endereços levantados do `flows.json` que já roda na bancada → `docs/tags/tabela-tags-grupo1.csv` (status A CONFIRMAR).
- Fluxo principal rodando com **simulador** (mesmos nomes de tags) e testes automatizados passando.
- Fluxo de diagnóstico isolado pronto e **desativado** (`node-red/node-red-flow-diagnostico-s7.json`).

## O que precisamos do responsável da automação

1. Autorização por escrito para conectar o notebook na rede da bancada (somente leitura).
2. Confirmação de IP, rack/slot, modelo e firmware da CPU.
3. A tabela oficial de tags (ou validação da nossa), incluindo os endereços de **Reset** e **velocidade da esteira**, que não existem no mapa atual.
4. Confirmação de que PUT/GET já está habilitado e os DBs 9/101/102/103 não são otimizados.
   **Não vamos alterar nada no TIA/CPU** — se não estiver habilitado, o item segue BLOCKED.
5. Acesso à watch table do TIA Portal para comparar os valores.
