#!/usr/bin/env node
// Gera captures/captura-exemplo-SIMULADA.jsonl usando o MESMO simulador do fluxo.
// Serve só para testar o replay sem a bancada. A captura de homologação deve ser REAL
// (INPUT_MODE=CLP + CAPTURE=true na bancada) — ver README, seção "Replay".
// Rodar na raiz:  node tools/gerar-captura-exemplo.js
const fs = require("fs"); const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FLOW = JSON.parse(fs.readFileSync(path.join(ROOT, "node-red", "flow_ingestao_n2.json"), "utf8"));
const code = FLOW.find(n => n.type === "function" && n.name === "Simulador CLP").func;
const ctx = {};
const sim = new Function("msg", "node", "context", "env", code);
const run = (msg) => sim(msg, { status() {} }, { get: k => ctx[k], set: (k, v) => { ctx[k] = v; } },
                         { get: k => (k === "INPUT_MODE" ? "SIMULADOR" : undefined) });

// Roteiro (segundos): parado -> START -> STOP -> START -> EMERGÊNCIA -> RESET -> START
const script = [[3, "START"], [11, "STOP"], [14, "START"], [19, "EMERGENCY"], [23, "RESET"], [26, "START"]];
const DURATION_S = 30;
let t = Date.parse("2026-11-03T14:00:00.000Z");
const lines = [];
for (let i = 0; i < DURATION_S * 10; i++) {
    const sec = i / 10;
    for (const [at, cmd] of script) if (Math.abs(sec - at) < 1e-9) run({ topic: "sim_cmd", payload: cmd });
    const m = run({ payload: t });
    lines.push(JSON.stringify({ t: new Date(t).toISOString(), source: "SIMULADOR", vars: m.payload }));
    t += 100;
}
const out = path.join(ROOT, "captures", "captura-exemplo-SIMULADA.jsonl");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(lines.length + " leituras (" + DURATION_S + " s) -> " + path.relative(ROOT, out));
