# Autorização escrita para escrita no CLP — Planta N2

**Sem este documento preenchido e assinado, `CLP_WRITE_AUTHORIZED` permanece `false` e nenhum comando chega ao CLP.**
Status atual: **BLOCKED — aguardando autorização.**

| Campo | Valor |
|---|---|
| Responsável pela automação (nome) | |
| CLP autorizado (modelo e IP) | ☐ S7-1200 Estoque 192.168.150.10  ☐ outro: ________ |
| Endereços autorizados | ☐ DB1,X0.4 START ☐ DB1,X0.5 STOP ☐ DB1,X0.6 RESET ☐ DB1,X0.7 EMERGÊNCIA |
| DB1 com "Optimized block access" desligado e PUT/GET habilitado | ☐ confirmado no TIA Portal |
| Lógica do CLP trata esses bits como pulso (botão) | ☐ confirmado |
| Período da autorização | de ____/____ a ____/____ |
| Condições (presença de responsável, área livre etc.) | |

Declaro que a emergência física e os intertravamentos locais prevalecem sobre qualquer comando de software e que
a aplicação web **não** substitui o circuito de segurança da Planta N2 (NR-12).

Assinatura: ______________________ Data: ____/____/2026

---
Ao assinar: na aba "Comandos e SPA local", `CLP_WRITE_AUTHORIZED=true` e
`CLP_WRITE_AUTH_REF=docs/evidence/sprint3/G1-S3-autorizacao-escrita-clp.md`. Ao fim do período, voltar a `false`.
