# Log dos testes da ponte borda-nuvem — Grupo 1 · Sprint 3

Entregável 15. Cada execução de `tools/teste-ponte-g1.js` **acrescenta uma seção** abaixo com data/hora,
versão (commit + hash do fluxo), resultado e métricas. Não edite as seções geradas.
O ensaio local (sem bancada) fica separado em `G1-S3-ensaio-local-*.md`.

## Como rodar (na bancada, Semana 7)

```bat
set SMART40_BROKER_URL=wss://smart40-broker.onrender.com
set SMART40_TEST_TOKEN=<token de teste do G1, NÃO o do agente>
node tools\teste-ponte-g1.js A
node tools\teste-ponte-g1.js B --duracao 10            (Node-RED com INPUT_MODE=TESTE_B)
node tools\teste-ponte-g1.js C --duracao 60
node tools\teste-ponte-g1.js resiliencia --duracao 300  (rodar em OUTRA máquina; tirar o cabo da bancada por 2 min)
node tools\teste-ponte-g1.js comandos --confirmo-bancada-segura
node tools\teste-ponte-g1.js continuidade --duracao 1800
```

Equivalente com wscat (Teste A do roteiro): `wscat -c "wss://smart40-broker.onrender.com?token=<token>"` — conexão
ok; com token errado, o broker fecha com **4001**. Cole a saída abaixo, **trocando o token por `<token>`**.

### Teste C no console da SPA do G4 (cole no DevTools, com a SPA aberta)

```js
(() => { const ws = new WebSocket('wss://smart40-broker.onrender.com?token=' + prompt('token de teste'));
  const t = []; ws.onmessage = e => { try { const f = JSON.parse(e.data); if (f.estacoes) t.push(Date.now()); } catch (_) {} };
  setTimeout(() => { ws.close(); const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
    console.log('frames', t.length, 'em 30 s · intervalo p50', d[d.length >> 1], 'ms · p95', d[Math.floor(d.length * .95)], 'ms'); }, 30000); })();
```

(O `prompt` evita deixar o token no código; tire print só do resultado.)

---

<!-- As execuções entram abaixo desta linha -->
