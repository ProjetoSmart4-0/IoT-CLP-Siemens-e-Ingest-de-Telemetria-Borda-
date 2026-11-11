// Testes da lógica de borda (sem Node-RED, sem CLP, sem internet).
// Lê o código dos nós "function" DIRETO do fluxo exportado.
// Rodar:  node node-red/tests/edge-logic.test.js   (a partir da raiz do projeto)
const fs = require("fs"); const path = require("path"); const assert = require("assert");
const FLOW = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "node-red-flow-grupo1.json"), "utf8"));
const code = (name) => { const n = FLOW.find(x => x.type === "function" && x.name === name); if (!n) throw new Error("Nó não encontrado: " + name); return n.func; };
const ENV = { SIMULATE: "true", HEARTBEAT_MS: "5000", BELT_NOMINAL_SPEED: "" };
const flowStore = {}; const timers = [];
function mk(name) {
  const ctx = {}; const sent = []; const statuses = []; const warns = [];
  const node = { status: s => statuses.push(s), warn: w => warns.push(w), send: m => sent.push(m), error: e => { throw e; } };
  const flow = { get: (k) => flowStore[k], set: (k, v) => { flowStore[k] = v; } };
  const context = { get: k => ctx[k], set: (k, v) => { ctx[k] = v; } };
  const env = { get: k => ENV[k] };
  const fn = new Function("msg", "node", "flow", "context", "env", "setTimeout", code(name));
  return { run: (msg) => fn(msg, node, flow, context, env, (f, ms) => timers.push(f)), sent, statuses, warns };
}
const sim = mk("Simulador CLP S7-1200"), norm = mk("Normaliza CLP → JSON"), chg = mk("Detecta mudança + heartbeat"), buf = mk("Buffer Store-and-Forward");
const mqttOut = [];
let clock = 1_700_000_000_000; Date.now = () => clock;
function tick() {
  clock += 100;
  let m = sim.run({ payload: clock }); if (!m) return;
  m = norm.run(m); if (!m) return;
  m = chg.run(m); if (!m) return;
  const out = buf.run(m); if (out) mqttOut.push(out);
}
function drainTimers() { while (timers.length) timers.shift()(); buf.sent.splice(0).forEach(x => mqttOut.push(x)); }

// conexão MQTT sobe
buf.run({ status: { fill: "green", text: "node-red:common.status.connected" } });
for (let i = 0; i < 10; i++) tick();
assert.strictEqual(mqttOut.length, 1, "primeira leitura = 1 STATE_CHANGE, resto descartado");
assert.strictEqual(mqttOut[0].payload.machine_state, "STOPPED");
assert.strictEqual(mqttOut[0].qos, 1);

sim.run({ topic: "sim_cmd", payload: "START" });
for (let i = 0; i < 10; i++) tick();
const st = mqttOut.slice(1).map(m => [m.payload.machine_state, m.payload.buttons.start_pressed]);
console.log("após START:", JSON.stringify(st));
assert.deepStrictEqual(st, [["RUNNING", true], ["RUNNING", false]], "botão pulsa e depois solta");
assert.strictEqual(mqttOut.at(-1).payload.belt_speed, null); // sem velocidade nominal configurada

// heartbeat
const before = mqttOut.length; for (let i = 0; i < 60; i++) tick();
assert.strictEqual(mqttOut.length - before, 1, "1 heartbeat em 6s");
assert.strictEqual(mqttOut.at(-1).payload.event, "HEARTBEAT");

// QUEDA DE REDE
buf.run({ status: { fill: "red", text: "node-red:common.status.disconnected" } });
const sentBeforeOutage = mqttOut.length;
sim.run({ topic: "sim_cmd", payload: "EMERGENCY" });
for (let i = 0; i < 300; i++) tick(); // 30s offline
assert.strictEqual(mqttOut.length, sentBeforeOutage, "nada sai enquanto offline");
const q = flowStore.sf_queue; console.log("fila offline:", q.length, q.map(i => i.payload.event + ":" + i.payload.machine_state).join(", "));
assert.ok(q.length >= 7);
// reconecta
buf.run({ status: { fill: "green", text: "connected" } });
drainTimers();
const flushed = mqttOut.slice(sentBeforeOutage);
assert.strictEqual(flowStore.sf_queue.length, 0, "fila vazia após descarregar");
assert.ok(flushed.every(m => m.payload.buffered === true));
const seqs = flushed.map(m => m.payload.seq);
assert.deepStrictEqual(seqs, [...seqs].sort((a, b) => a - b), "ordem preservada");
assert.strictEqual(flushed[0].payload.machine_state, "EMERGENCY");
const ids = mqttOut.map(m => m.payload.msg_id); assert.strictEqual(new Set(ids).size, ids.length, "msg_id únicos");
console.log("descarregadas após reconexão:", flushed.length, "| ordem OK | msg_id únicos OK");

// teste forçado offline + limite do buffer
ENV.BUFFER_MAX = "5";
buf.run({ topic: "__force_offline__" });
sim.run({topic:"sim_cmd",payload:"RESET"});
for (let k = 0; k < 6; k++) { sim.run({topic:"sim_cmd",payload: k%2?"STOP":"START"}); for (let i = 0; i < 10; i++) tick(); }
assert.strictEqual(flowStore.sf_queue.length, 5); console.log("limite do buffer respeitado:", buf.warns.at(-1));
buf.run({ topic: "__force_online__" }); drainTimers();
assert.strictEqual(flowStore.sf_queue.length, 0);

// PLC real com SIMULATE=true é ignorado; e mapeamento ALARM
assert.strictEqual(norm.run({ payload: {}, source: "PLC" }), null);
ENV.SIMULATE = "false"; ENV.BELT_NOMINAL_SPEED = "0.45";
const r = norm.run({ payload: { processo_segurancaOK: true, montagem_segurancaOK: false, expedicao_segurancaOK: true } });
assert.strictEqual(r.payload.machine_state, "ALARM");
const r2 = norm.run({ payload: { processo_segurancaOK: true, montagem_segurancaOK: true, expedicao_segurancaOK: true, montagem_esteira1: true } });
assert.strictEqual(r2.payload.machine_state, "RUNNING"); assert.strictEqual(r2.payload.belt_speed, 0.45);
console.log("\nTODOS OS TESTES DA LÓGICA DE BORDA PASSARAM ✅");
