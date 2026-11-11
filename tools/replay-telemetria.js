#!/usr/bin/env node
// =============================================================================
// VALIDAÇÃO DE REPLAY (Sprint 2 · Grupo 1)
// Reinjeta uma captura da Planta N2 no fluxo Node-RED (flow_ingestao_n2.json) e
// confere o pipeline inteiro sem o hardware ligado:
//   captura (100 ms) -> POST /replay/s7 -> normalização -> agregação 500 ms
//   -> outbox SQLite -> MQTTS -> (PUBACK) -> iot-service -> Neon
//
// Pré-requisitos: Node.js 18+, Node-RED rodando com o fluxo e INPUT_MODE=REPLAY.
// Uso (na raiz do repositório):
//   node tools/replay-telemetria.js captures/captura-n2.jsonl
//   node tools/replay-telemetria.js captures/captura-n2.jsonl --url http://localhost:1880 --velocidade 2
// Opções:
//   --url URL          Node-RED (padrão http://localhost:1880)
//   --velocidade N     acelera o replay (padrão 1 = tempo real; use 1 na homologação)
//   --espera S         tempo máximo para a outbox esvaziar após o replay (padrão 60)
//   --sem-relatorio    não grava docs/evidence/sprint2/G1-replay-*.md
// Saída: código 0 se todas as verificações passarem, 1 caso contrário.
// =============================================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const file = args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--url"
                         && args[args.indexOf(a) - 1] !== "--velocidade" && args[args.indexOf(a) - 1] !== "--espera");
const URL_NR = (opt("--url", "http://localhost:1880")).replace(/\/$/, "");
const SPEED = Number(opt("--velocidade", "1"));
const WAIT_S = Number(opt("--espera", "60"));
const REPORT = !args.includes("--sem-relatorio");

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(p) {
    const r = await fetch(URL_NR + p);
    if (!r.ok) throw new Error("GET " + p + " -> HTTP " + r.status);
    return r.json();
}

// Mesma regra de estado do fluxo (lida do próprio flow_ingestao_n2.json)
function loadNormalizer() {
    const flow = JSON.parse(fs.readFileSync(path.join(ROOT, "node-red", "flow_ingestao_n2.json"), "utf8"));
    const code = flow.find(n => n.type === "function" && n.name === "Normaliza CLP → amostra").func;
    const fn = new Function("msg", "env", code);
    return vars => fn({ payload: vars, source: "REPLAY" }, { get: () => undefined }).payload;
}
const dedupe = arr => arr.filter((v, i) => i === 0 || v !== arr[i - 1]);

async function main() {
    if (!file) { console.error("Informe o arquivo da captura. Ex.: node tools/replay-telemetria.js captures/captura-n2.jsonl"); process.exit(2); }
    if (!(SPEED > 0)) { console.error("--velocidade deve ser > 0"); process.exit(2); }

    // ---- 1. lê e valida a captura ----
    const raw = fs.readFileSync(path.resolve(file), "utf8").split(/\r?\n/).filter(l => l.trim());
    const rows = [];
    raw.forEach((l, i) => {
        let o; try { o = JSON.parse(l); } catch (e) { throw new Error("Linha " + (i + 1) + ": JSON inválido"); }
        if (!o.t || isNaN(Date.parse(o.t)) || typeof o.vars !== "object") throw new Error("Linha " + (i + 1) + ": precisa de 't' (ISO) e 'vars'");
        rows.push(o);
    });
    if (rows.length < 2) throw new Error("Captura vazia ou com menos de 2 leituras");
    const t0 = Date.parse(rows[0].t), tN = Date.parse(rows.at(-1).t);
    const simulated = rows.some(r => r.source === "SIMULADOR");
    const normalize = loadNormalizer();
    const expectedStates = dedupe(rows.map(r => normalize(r.vars).machine_state));
    console.log(`Captura: ${rows.length} leituras, ${((tN - t0) / 1000).toFixed(1)} s, estados: ${expectedStates.join(" > ")}`);
    if (simulated) console.log("ATENÇÃO: captura SIMULADA. Para homologação use uma captura real da bancada.");

    // ---- 2. confere o Node-RED ----
    let before;
    for (let i = 0; ; i++) {          // Node-RED pode estar terminando de subir
        try { before = await getJSON("/edge/status"); break; }
        catch (e) {
            if (i >= 20) throw new Error("Node-RED não respondeu em " + URL_NR + "/edge/status (" + e.message + "). O fluxo flow_ingestao_n2.json está importado e com Deploy?");
            await sleep(1000);
        }
    }
    if (before.input_mode !== "REPLAY") {
        console.error(`Node-RED está com INPUT_MODE=${before.input_mode}. Mude para REPLAY (duplo clique na aba -> Environment Variables) e faça Deploy.`);
        process.exit(2);
    }
    if (!before.outbox_ready) { console.error("Outbox SQLite indisponível no Node-RED (Node.js >= 22.13 e settings.js do repositório)."); process.exit(2); }
    const seq0 = before.last_telemetry ? before.last_telemetry.seq : 0;
    const total0 = before.outbox.PENDING + before.outbox.INFLIGHT + before.outbox.SENT;

    // ---- 3. injeta respeitando o tempo original ----
    const start = Date.now();
    let errors = 0;
    for (let i = 0; i < rows.length; i++) {
        const due = start + (Date.parse(rows[i].t) - t0) / SPEED;
        const wait = due - Date.now();
        if (wait > 0) await sleep(wait);
        try {
            const r = await fetch(URL_NR + "/replay/s7", { method: "POST", headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ captured_at: rows[i].t, vars: rows[i].vars }) });
            if (r.status !== 202) { errors++; if (errors <= 3) console.error("HTTP " + r.status + ": " + await r.text()); }
        } catch (e) { errors++; if (errors <= 3) console.error(e.message); }
        if (i % 50 === 0) process.stdout.write(`\r  enviadas ${i + 1}/${rows.length}`);
    }
    const elapsed = Date.now() - start;
    console.log(`\r  enviadas ${rows.length}/${rows.length} em ${(elapsed / 1000).toFixed(1)} s (erros HTTP: ${errors})`);

    // ---- 4. espera a última janela e a outbox esvaziar (PUBACK de tudo) ----
    await sleep(1200);
    let after, deadline = Date.now() + WAIT_S * 1000;
    do {
        after = await getJSON("/edge/status");
        if (after.outbox.PENDING + after.outbox.INFLIGHT === 0) break;
        process.stdout.write(`\r  aguardando outbox: ${after.outbox.PENDING + after.outbox.INFLIGHT} pendentes (MQTT ${after.mqtt_online ? "online" : "OFFLINE"})   `);
        await sleep(1000);
    } while (Date.now() < deadline);
    console.log("");

    // ---- 5. verificações ----
    const msgs = (await getJSON("/edge/recent?since_seq=" + seq0)).filter(m => m.source === "REPLAY");
    const seqs = msgs.map(m => m.seq);
    const contiguous = seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1);
    const samples = msgs.reduce((a, m) => a + m.aggregation.samples, 0);
    const observedStates = dedupe(msgs.flatMap(m => m.aggregation.states_seen));
    const expectedWindows = Math.ceil(elapsed / 500);
    const created = after.outbox.PENDING + after.outbox.INFLIGHT + after.outbox.SENT - total0;
    const pending = after.outbox.PENDING + after.outbox.INFLIGHT;

    const checks = [
        ["Todas as leituras aceitas pelo Node-RED (HTTP 202)", errors === 0, `${rows.length - errors}/${rows.length}`],
        ["Nenhuma leitura perdida na agregação", samples === rows.length - errors, `${samples} amostras agregadas`],
        ["Uma mensagem a cada ~500 ms", Math.abs(msgs.length - expectedWindows) <= 2, `${msgs.length} mensagens (esperado ~${expectedWindows})`],
        ["Sequência (seq) sem buracos", msgs.length > 0 && contiguous, seqs.length ? `seq ${seqs[0]}..${seqs.at(-1)}` : "nenhuma mensagem"],
        ["Estados iguais aos da captura", JSON.stringify(observedStates) === JSON.stringify(expectedStates), observedStates.join(" > ")],
        ["Toda mensagem gravada na outbox_telemetry", created >= msgs.length, `${created} linhas novas`],
        ["Outbox vazia: tudo confirmado pelo broker (PUBACK)", pending === 0, pending === 0 ? "0 pendentes" : `${pending} pendentes (MQTT ${after.mqtt_online ? "online" : "OFFLINE"})`],
    ];
    const ok = checks.every(c => c[1]);
    console.log("");
    checks.forEach(([name, pass, det]) => console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (${det})`));
    console.log(`\nResultado: ${ok ? (simulated ? "PASS WITH LIMITATION (captura simulada)" : "PASS") : "FAIL"}`);
    console.log("Próximo passo: confira no iot-service (GET /api/v1/telemetry/history) as mensagens com source = REPLAY.");

    if (REPORT) {
        const day = new Date().toISOString().slice(0, 10);
        const dir = path.join(ROOT, "docs", "evidence", "sprint2");
        fs.mkdirSync(dir, { recursive: true });
        const out = path.join(dir, `G1-replay-${day}.md`);
        fs.writeFileSync(out, [
            `# Validação de replay — Grupo 1 — ${day}`, "",
            `Gerado por \`node tools/replay-telemetria.js\`. Sem segredos.`, "",
            "| Campo | Valor |", "|---|---|",
            `| Captura | \`${path.relative(ROOT, path.resolve(file)).replace(/\\/g, "/")}\` |`,
            `| Tipo | ${simulated ? "SIMULADA (não vale como homologação)" : "Real (bancada)"} |`,
            `| Leituras | ${rows.length} (${((tN - t0) / 1000).toFixed(1)} s, de ${rows[0].t} a ${rows.at(-1).t}) |`,
            `| Velocidade | ${SPEED}x |`,
            `| Node-RED | ${URL_NR} (MQTT ${after.mqtt_online ? "online" : "OFFLINE"}) |`, "",
            "| Verificação | Status | Detalhe |", "|---|---|---|",
            ...checks.map(([n, p, d]) => `| ${n} | ${p ? "✅ PASS" : "❌ FAIL"} | ${d} |`), "",
            `**Resultado: ${ok ? (simulated ? "PASS WITH LIMITATION (captura simulada)" : "PASS") : "FAIL"}**`, ""
        ].join("\n"));
        console.log("Relatório: " + path.relative(ROOT, out));
    }
    process.exit(ok ? 0 : 1);
}
main().catch(e => { console.error("Erro: " + e.message); process.exit(1); });
