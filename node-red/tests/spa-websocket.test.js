// Testes da aba "Comandos e SPA local" (dentro do flow_ingestao_n2.json consolidado) — sem Node-RED, sem CLP, sem broker.
// Roda o código dos nós "function" direto do JSON, encadeado com o simulador do fluxo de ingestão.
// Rodar (raiz do projeto):  node node-red/tests/spa-websocket.test.js
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.join(__dirname, "..");
const ALL = JSON.parse(fs.readFileSync(path.join(ROOT, "flow_ingestao_n2.json"), "utf8"));
const ING = ALL.filter(n => n.z === "b6a3277f0d94318e" || (!n.z && n.type !== "tab" && n.id !== "spa_ws_listener" && n.id !== "s3_s7_cmd_endpoint") || n.id === "b6a3277f0d94318e");
const SPA = ALL.filter(n => n.z === "spa_tab" || n.id === "spa_tab" || n.id === "spa_ws_listener");
const OUTRAS = ALL.filter(n => !ING.includes(n) && !SPA.includes(n));
const ENV = { INPUT_MODE: "SIMULADOR" }; const G = {};
function mk(flow, name) {
    const n = flow.find(x => x.type === "function" && x.name === name); if (!n) throw new Error("Nó não encontrado: " + name);
    const ctx = {}, warns = [];
    const node = { status() {}, warn: w => warns.push(w), error: e => { throw new Error(e); } };
    const f = new Function("msg", "node", "flow", "global", "context", "env", n.func);
    return { run: m => f(m, node, { get() {}, set() {} }, { get: k => G[k], set: (k, v) => { G[k] = v; } },
        { get: k => ctx[k], set: (k, v) => { ctx[k] = v; } }, { get: k => ENV[k] }), warns };
}
const sim = mk(ING, "Simulador CLP"), fonte = mk(ING, "Fonte ativa (INPUT_MODE)"), norm = mk(ING, "Normaliza CLP → amostra");
const montar = mk(SPA, "montarTelemetria"), validar = mk(SPA, "validarComando"), aplicar = mk(SPA, "aplicarComando");
const consolidar = mk(SPA, "consolidar"), gravar = mk(SPA, "gravarPedido"), gate = mk(SPA, "Elipse habilitado?");

function ciclo(n = 3) { for (let i = 0; i < n; i++) { const m = sim.run({ payload: Date.now() }); if (!m) continue;
    const [a] = fonte.run(m); if (a) montar.run(norm.run(a)); } }
function comando(c, session = "s1") {            // simula: ws in -> validar -> switch -> aplicar
    const [ok, nack] = validar.run({ payload: c, _session: session });
    if (!ok) return { ack: nack && nack.payload, sim: null };
    const [toSim, ack] = aplicar.run(ok);
    if (toSim) sim.run(toSim);
    return { ack: ack.payload, sessao: ack._session, sim: toSim };
}
const pub = () => consolidar.run({}).payload;
const st = () => pub().estacoes;
const O = "unidade1-grupo1";

ciclo(); assert.strictEqual(st().processo.status, "AGUARDANDO"); console.log("ok  estado inicial AGUARDANDO");
let r = comando({ acao: "START", origem: O, id: "t1" }); ciclo(5);
assert.ok(r.ack.aceito && r.ack.id === "t1" && r.sessao === "s1"); // ack volta só para a sessão do remetente
assert.strictEqual(st().processo.status, "OPERANDO"); assert.strictEqual(pub().esteira.motorLigado, true);
console.log("ok  START aceito, ack só para o remetente, telemetria OPERANDO");
r = comando({ acao: "STOP", origem: O }); ciclo(5);
assert.ok(r.ack.aceito); assert.strictEqual(st().montagem.status, "AGUARDANDO"); assert.strictEqual(pub().esteira.motorLigado, false);
console.log("ok  STOP -> AGUARDANDO");
r = comando({ acao: "EMERGENCY_STOP", origem: "qualquer" }); ciclo(5);
assert.ok(r.ack.aceito); assert.ok(Object.values(st()).every(s => s.status === "EMERGENCIA"));
console.log("ok  EMERGENCY_STOP aceito de qualquer origem -> todas EMERGENCIA");
r = comando({ acao: "START", origem: O }); ciclo(5);
assert.strictEqual(st().processo.status, "EMERGENCIA"); console.log("ok  START bloqueado durante emergência (regra do simulador)");
r = comando({ acao: "RESET", origem: O }); ciclo(5);
assert.ok(r.ack.aceito); assert.strictEqual(st().processo.status, "AGUARDANDO"); console.log("ok  RESET limpa a emergência");

r = comando({ acao: "START", origem: "hacker" }); assert.strictEqual(r.ack.aceito, false); assert.match(r.ack.motivo, /origem/);
r = comando({ acao: "START" }); assert.strictEqual(r.ack.aceito, false);
r = comando({ acao: "EXPLODIR", origem: O }); assert.strictEqual(r.ack.aceito, false); assert.match(r.ack.motivo, /desconhecida/);
console.log("ok  origem inválida / ausente / ação desconhecida rejeitadas com ack");
assert.strictEqual(validar.run({ payload: { roboUR: {}, estacoes: {} } }), null);
assert.strictEqual(validar.run({ payload: { tipo: "ack", acao: "START" } }), null);
assert.strictEqual(validar.run({ payload: { foo: 1 } }), null);
assert.strictEqual(validar.run({ payload: "lixo{" }), null);
console.log("ok  eco de telemetria/ack e lixo são descartados");
const [v] = validar.run({ payload: JSON.stringify({ acao: "STOP", origem: O }) }); assert.ok(v); console.log("ok  payload string JSON aceito");

ENV.WS_TOKEN = "segredo";
assert.match(comando({ acao: "START", origem: O }).ack.motivo, /token/);
assert.ok(comando({ acao: "START", origem: O, token: "segredo" }).ack.aceito);
assert.ok(comando({ acao: "EMERGENCY_STOP" }).ack.aceito); delete ENV.WS_TOKEN;
console.log("ok  WS_TOKEN opcional (E-Stop continua sempre aceito)");

G.input_mode_ingestao = "CLP"; r = comando({ acao: "START", origem: O });
assert.strictEqual(r.ack.aceito, false); assert.strictEqual(r.sim, null); assert.match(r.ack.motivo, /autorização escrita/);
G.input_mode_ingestao = "SIMULADOR"; console.log("ok  modo CLP sem autorização escrita: nada é escrito, ack aceito=false");

const antes = pub().pedidoAtual; gravar.run({ payload: { trackingCode: "OP7", componentId: 2 } });
assert.strictEqual(pub().pedidoAtual.trackingCode, "OP7"); assert.strictEqual(antes, null); console.log("ok  pedido do Elipse entra na telemetria");
assert.strictEqual(gate.run({}), null); ENV.ELIPSE_ENABLED = "true"; assert.ok(gate.run({}).url.includes("/api/Events/order/current"));
console.log("ok  Elipse só consultado com ELIPSE_ENABLED=true");

const t = pub(); for (const k of ["timestamp", "roboUR", "esteira", "estacoes", "pedidoAtual"]) assert.ok(k in t);
assert.deepStrictEqual(Object.keys(t.estacoes).sort(), ["estoque", "expedicao", "montagem", "processo"]);
console.log("ok  contrato da telemetria completo (4 estações)");

const ids = new Set(ALL.map(n => n.id)); assert.strictEqual(ids.size, ALL.length, "ids duplicados");
for (const n of ALL) { for (const w of (n.wires || []).flat()) assert.ok(ids.has(w), "wire órfão " + w); for (const l of (n.links || [])) assert.ok(ids.has(l), "link órfão " + l); }
const lo = ING.find(n => n.id === "spa_lo_amostra"), li = SPA.find(n => n.id === "spa_li_amostra");
assert.ok(lo.links.includes(li.id) && li.links.includes(lo.id));
const s7out = ALL.filter(n => n.type === "s7 out");
assert.strictEqual(s7out.length, 4); assert.ok(s7out.every(n => n.endpoint === "s3_s7_cmd_endpoint"));
console.log("ok  links entre as abas íntegros, sem wires órfãos; os 4 s7 out só escrevem no endpoint de comandos");
console.log("\nTODOS OS TESTES DA ABA DE COMANDOS E SPA LOCAL PASSARAM");
