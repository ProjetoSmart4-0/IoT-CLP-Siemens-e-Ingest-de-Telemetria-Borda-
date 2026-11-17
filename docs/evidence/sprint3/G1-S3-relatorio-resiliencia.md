# Relatório do teste de resiliência / replay do Outbox — entregável 16

## Procedimento (roteiro 6.6)

1. Node-RED da bancada com `INPUT_MODE=CLP` (ou `SIMULADOR` se o CLP não estiver liberado — registrar).
2. Em **outra máquina/rede**: `node tools/teste-ponte-g1.js resiliencia --duracao 300`.
3. Aos ~60 s, desconectar o cabo de rede da bancada por **2 minutos**; reconectar.
4. Durante a queda, abrir `http://localhost:1880/edge/ponte` na bancada e tirar print do `PENDING` crescendo.
5. Depois da reconexão, aguardar o script terminar (ele anexa o resultado ao `log_testes_ponte_g1.md`).

Critério: frames da queda chegam com `meta.buffered=true`, **em ordem**, **sem lacunas de seq nem de tempo**;
repetições de reenvio têm o mesmo `meta.msg_id` e são descartadas pelo consumidor (contadores não duplicam).

## Resultado na bancada

| Campo | Valor |
|---|---|
| Data/hora | |
| Versão (commit) | |
| Duração da queda | |
| Frames retidos na outbox (print) | |
| Lacunas de seq / de tempo | |
| Repetições descartadas por msg_id | |
| Resultado | |

## Ensaio prévio (sem bancada)

`G1-S3-ensaio-local-2026-11-17.md`: broker de ensaio fora por 20 s e link derrubado pelo inject por 30 s,
ambos PASS (0 lacunas, replay em ordem estrita). Serve de ensaio, não de homologação.
