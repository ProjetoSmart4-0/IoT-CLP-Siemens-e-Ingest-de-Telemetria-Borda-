// Testes do flow_ingestao_n2.json (Sprint 2) — sem Node-RED, sem CLP, sem broker.
// Executa o código dos nós "function" DIRETO do fluxo exportado, com SQLite real.
// Rodar (raiz do projeto, Node.js >= 22.13):  node node-red/tests/ingestao-n2.test.js
process.removeAllListeners("warning");
const fs = require("fs"); const os = require("os"); const path = require("path"); const assert = require("assert");
const sqlite = require("node:sqlite");

const ROOT = path.join(__dirname, "..", "..");
const FLOW = JSON.parse(fs.readFileSync(path.join(ROOT, "node-red", "flow_ingestao_n2.json"), "utf8"));
const fnNode = (name) => { const n = FLOW.find(x => x.type === "function" && x.name === name); if (!n) throw new Error("Nó não encontrado: " + name); return n; };

const ENV = { INPUT_MODE: "SIMULADOR", AGG_WINDOW_MS: "500", ACK_TIMEOUT_MS: "5000", OUTBOX_BATCH: "100", OUTBOX_MAX: "200000" };
const flowStore = {}; const globalStore = {
    sqlite, outboxPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "g1-")), "outbox.sqlite") };
let clock = Date.parse("2026-11-03T14:00:00.000Z"); Date.now = () => clock;
const RealDate = Date;
global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } };

function mk(name, field = "func") {
    const ctx = {}; const statuses = []; const warns = [];
    const node = { status: s => statuses.push(s), warn: w => warns.push(w), error: e => { throw new Error(String(e)); }, send() {} };
    const flow = { get: k => flowStore[k], set: (k, v) => { flowStore[k] = v; } };
    const global_ = { get: k => globalStore[k], set: (k, v) => { globalStore[k] = v; } };
    const context = { get: k => ctx[k], set: (k, v) => { ctx[k] = v; } };
    const env = { get: k => ENV[k] };
    const f = new Function("msg", "node", "flow", "global", "context", "env", fnNode(name)[field]);
    return { run: (msg) => f(msg, node, flow, global_, context, env), statuses, warns };
}

// ---------- DDL do fluxo == db/002_outbox_telemetry.sql ----------
const sqlFile = fs.readFileSync(path.join(ROOT, "db", "002_outbox_telemetry.sql"), "utf8");
const strip = s => s.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
const ddlInFlow = /db\.exec\(`([\s\S]*?)`\);/.exec(fnNode("Outbox: grava (SQLite)").initialize)[1];
assert.ok(strip(sqlFile).includes(strip(ddlInFlow)), "DDL do fluxo diferente de db/002_outbox_telemetry.sql");
console.log("ok  DDL do fluxo igual ao db/002_outbox_telemetry.sql");

mk("Outbox: grava (SQLite)", "initialize").run({});
const db = globalStore.outbox_db; assert.ok(db, "outbox aberta");
const sim = mk("Simulador CLP"), fonte = mk("Fonte ativa (INPUT_MODE)"), norm = mk("Normaliza CLP → amostra");
const agg = mk("Agregador 500 ms"), grava = mk("Outbox: grava (SQLite)"), desp = mk("Outbox: despacha");
const conf = mk("Outbox: confirma (SENT)"), falha = mk("Outbox: falha (reenviar)"), replay = mk("Replay: entrada");
const published = [];
const rows = st => db.prepare("SELECT COUNT(*) AS n FROM outbox_telemetry WHERE status = ?").get(st).n;

let ticks = 0;
function tick100() {                        // 1 leitura do "CLP" a cada 100 ms
    clock += 100; ticks++;
    let m = sim.run({ payload: clock }); if (!m) return;
    const [toNorm] = fonte.run(m); if (!toNorm) return;
    agg.run(norm.run(toNorm));
    if (ticks % 5 === 0) {                  // janela de 500 ms + despachante
        const out = agg.run({ topic: "__flush__" });
        if (out) grava.run(out);
        dispatch();
    }
}
let broker = { online: true, ack: true };
function dispatch(msg = { topic: "__tick__" }) {
    const r = desp.run(msg); if (!r) return;
    for (const m of r[0]) {
        if (!broker.online) continue;       // perdida no caminho: sem PUBACK
        published.push(m);
        if (broker.ack) conf.run(m);
    }
}
desp.run({ status: { fill: "green" } });

// ---------- 100 ms -> 1 mensagem a cada 500 ms ----------
for (let i = 0; i < 20; i++) tick100();     // 2 s
assert.strictEqual(published.length, 4, "2 s = 4 janelas de 500 ms");
assert.ok(published.every(m => m.payload.aggregation.samples === 5), "5 amostras por janela");
assert.ok(published.every(m => m.qos === 1 && m.payload.schema_version === "1.1"));
console.log("ok  leitura 100 ms -> 1 mensagem por janela de 500 ms (5 amostras)");

// ---------- toque de 100-300 ms não se perde ----------
sim.run({ topic: "sim_cmd", payload: "START" });
for (let i = 0; i < 10; i++) tick100();
const startMsgs = published.slice(4).filter(m => m.payload.buttons.start_pressed);
assert.strictEqual(startMsgs.length, 1, "START aparece em exatamente uma janela");
assert.strictEqual(startMsgs[0].payload.event, "STATE_CHANGE");
assert.strictEqual(published.at(-1).payload.machine_state, "RUNNING");
console.log("ok  botão START (pulso de 300 ms) registrado na janela");

// ---------- tudo confirmado vira SENT ----------
assert.strictEqual(rows("PENDING") + rows("INFLIGHT"), 0);
assert.strictEqual(rows("SENT"), published.length);
console.log("ok  toda mensagem com PUBACK virou SENT na outbox_telemetry");

// ---------- queda do broker: fica na outbox, volta em ordem com buffered=true ----------
desp.run({ status: { fill: "red" } }); broker.online = false;
const sentBefore = published.length;
sim.run({ topic: "sim_cmd", payload: "EMERGENCY" });
for (let i = 0; i < 100; i++) tick100();     // 10 s offline
assert.strictEqual(published.length, sentBefore, "nada sai offline");
assert.strictEqual(rows("PENDING"), 20, "20 janelas guardadas");
broker.online = true; dispatch({ status: { fill: "green" } });   // reconexão já dispara o envio
const flushed = published.slice(sentBefore);
assert.strictEqual(flushed.length, 20);
assert.ok(flushed.every(m => m.payload.buffered === true), "reenviadas marcadas buffered");
assert.strictEqual(flushed[0].payload.machine_state, "EMERGENCY");
const seqs = published.map(m => m.payload.seq);
assert.deepStrictEqual(seqs, seqs.map((_, i) => seqs[0] + i), "seq contínua e em ordem");
assert.strictEqual(rows("PENDING") + rows("INFLIGHT"), 0);
console.log("ok  broker fora 10 s: 20 msg na outbox, reenviadas em ordem, buffered=true, sem buracos");

// ---------- publish sem PUBACK: reenvia após ACK_TIMEOUT ----------
broker.ack = false;
const n0 = published.length;
for (let i = 0; i < 5; i++) tick100();      // 1 janela -> INFLIGHT
assert.strictEqual(rows("INFLIGHT"), 1);
for (let i = 0; i < 20; i++) tick100();     // 2 s: segura as próximas (ordem)
assert.strictEqual(published.length, n0 + 1, "não manda lote novo enquanto espera PUBACK");
broker.ack = true;
for (let i = 0; i < 40; i++) tick100();     // passa do ACK_TIMEOUT (5 s): reenvia
const resent = published.slice(n0).filter(m => m.payload.msg_id === published[n0].payload.msg_id);
assert.ok(resent.length >= 2, "mesma mensagem reenviada (mesmo msg_id -> iot-service deduplica)");
assert.ok(resent[1].payload.buffered === true);
assert.strictEqual(rows("PENDING") + rows("INFLIGHT"), 0);
console.log("ok  sem PUBACK: volta para PENDING e é reenviada com o mesmo msg_id");

// ---------- erro no publish (nó catch) ----------
db.prepare("UPDATE outbox_telemetry SET status='INFLIGHT' WHERE id = (SELECT MAX(id) FROM outbox_telemetry)").run();
const lastId = db.prepare("SELECT MAX(id) AS id FROM outbox_telemetry").get().id;
falha.run({ outbox_id: lastId, error: { message: "Connection closed" } });
assert.strictEqual(db.prepare("SELECT status, last_error FROM outbox_telemetry WHERE id=?").get(lastId).status, "PENDING");
console.log("ok  erro no publish devolve a linha para PENDING");

// ---------- outbox sobrevive a reinício (arquivo SQLite) ----------
desp.run({ status: { fill: "red" } }); broker.online = false;
for (let i = 0; i < 10; i++) tick100();
const pend = rows("PENDING");
db.close(); globalStore.outbox_db = undefined;
mk("Outbox: grava (SQLite)", "initialize").run({});
assert.strictEqual(globalStore.outbox_db.prepare("SELECT COUNT(*) AS n FROM outbox_telemetry WHERE status='PENDING'").get().n, pend);
console.log("ok  pendentes continuam no SQLite após reiniciar o Node-RED (" + pend + ")");

// ---------- replay e INPUT_MODE ----------
let [toPipe, resp] = replay.run({ payload: { vars: {} }, req: {}, res: {} });
assert.strictEqual(toPipe, null); assert.strictEqual(resp.statusCode, 409, "replay recusado fora do modo REPLAY");
ENV.INPUT_MODE = "REPLAY";
[toPipe, resp] = replay.run({ payload: { captured_at: "2026-11-03T14:00:00Z", vars: { emergencia: true } }, req: {}, res: {} });
assert.strictEqual(resp.statusCode, 202);
assert.strictEqual(norm.run(fonte.run(toPipe)[0]).payload.machine_state, "EMERGENCY");
assert.strictEqual(fonte.run({ payload: {}, source: "SIMULATOR" }), null, "simulador ignorado em REPLAY");
console.log("ok  replay: 409 fora do modo REPLAY, 202 e injeção no pipeline em REPLAY");

// ---------- captura só grava leitura real do CLP ----------
ENV.INPUT_MODE = "CLP"; ENV.CAPTURE = "true"; globalStore.captureFile = "cap.jsonl";
const [, cap] = fonte.run({ payload: { emergencia: false } });
assert.strictEqual(JSON.parse(cap.payload).source, "PLC"); assert.strictEqual(cap.filename, "cap.jsonl");
console.log("ok  CAPTURE=true grava a leitura do CLP em JSONL para o replay");

// ---------- somente leitura ----------
assert.ok(!FLOW.some(n => n.type === "s7 out"), "fluxo não pode ter s7 out");
assert.ok(!FLOW.some(n => n.type === "s7 endpoint" && JSON.stringify(n).match(/password/i)));
console.log("ok  fluxo somente leitura (nenhum nó s7 out)");
console.log("\nTODOS OS TESTES DO flow_ingestao_n2.json PASSARAM");
