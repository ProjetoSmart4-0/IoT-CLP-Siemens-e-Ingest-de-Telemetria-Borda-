// Testes da ponte borda-nuvem WSS (Sprint 3) — sem Node-RED, sem CLP, sem broker.
// Executa o código dos nós "function" direto do flow_ingestao_n2.json, com SQLite real,
// um WebSocket falso e relógio controlado.
// Rodar (raiz do projeto, Node.js >= 22.13):  node node-red/tests/ponte-wss.test.js
process.removeAllListeners("warning");
const fs = require("fs"), os = require("os"), path = require("path"), assert = require("assert");
const sqlite = require("node:sqlite");
const ROOT = path.join(__dirname, "..", "..");
const FLOW = JSON.parse(fs.readFileSync(path.join(ROOT, "node-red", "flow_ingestao_n2.json"), "utf8"));
const node_ = (name) => { const n = FLOW.find(x => x.type === "function" && x.name === name); if (!n) throw new Error("Nó não encontrado: " + name); return n; };
const tabEnv = (label) => Object.fromEntries((FLOW.find(n => n.type === "tab" && n.label.includes(label)).env || []).map(e => [e.name, e.value]));

// ---------- relógio e timers controlados ----------
let clock = Date.parse("2026-11-18T13:00:00.000Z");
const RealDate = Date;
global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } };
let timers = [];
global.setTimeout = (fn, ms) => { const t = { fn, at: clock + ms }; timers.push(t); return t; };
global.clearTimeout = (t) => { timers = timers.filter(x => x !== t); };
function avanca(ms, passo = 100, cadaPasso) {
    const fim = clock + ms;
    while (clock < fim) {
        clock += passo;
        for (const t of timers.filter(x => x.at <= clock)) { timers = timers.filter(x => x !== t); t.fn(); }
        if (cadaPasso) cadaPasso();
    }
}

// ---------- WebSocket falso (no lugar do global WebSocket do Node 22) ----------
const broker = { aceita: true, tokenValido: "token-teste", recebidos: [], sockets: [], echo: false };
class FakeWS {
    constructor(url) {
        this.url = url; this.readyState = 0; this.bufferedAmount = 0; broker.sockets.push(this);
        const tok = new URL(url).searchParams.get("token");
        setTimeout(() => {
            if (!broker.aceita) { this.readyState = 3; this.onerror && this.onerror({}); return; }   // igual ao Node 22: só "error", sem "close"
            this.readyState = 1; this.onopen && this.onopen();
            if (tok !== broker.tokenValido) setTimeout(() => this.cair(4001, "token invalido"), 10);
        }, 50);
    }
    send(d) { if (this.readyState !== 1) throw new Error("socket fechado"); broker.recebidos.push(JSON.parse(d));
              if (broker.echo) { const o = JSON.parse(d); setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(o) }), 20); } }
    close(code, reason) { this.cair(code || 1000, reason || ""); }
    cair(code, reason) { if (this.readyState === 3) return; this.readyState = 3; this.onclose && this.onclose({ code, reason }); }
    chega(obj) { this.onmessage && this.onmessage({ data: JSON.stringify(obj) }); }
}

// ---------- ambiente das abas ----------
const ENV_PONTE = Object.assign(tabEnv("Ponte"), { SMART40_BROKER_URL: "wss://smart40-broker.example", SMART40_AGENT_TOKEN: "token-teste" });
const ENV_CMD = Object.assign(tabEnv("Comandos"), {});
const ENV_ING = Object.assign(tabEnv("Ingestão"), { INPUT_MODE: "SIMULADOR" });
const G = { sqlite, WebSocket: FakeWS, pontePath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "g1s3-")), "ponte.sqlite") };
const FLOWCTX = { ponte: {}, cmd: {}, ing: {} };
const saidas = [];

function mk(name, ENV, fctx, field = "func") {
    const ctx = {}, warns = [], errors = [], statuses = [], sent = [];
    const n = node_(name);
    const node = { id: n.id, status: s => statuses.push(s), warn: w => warns.push(w), error: e => errors.push(String(e)),
                   send: m => { sent.push(m); saidas.push({ name, m }); } };
    const api = (code) => new Function("msg", "node", "flow", "global", "context", "env", code);
    const args = (msg) => [msg, node, { get: k => fctx[k], set: (k, v) => { fctx[k] = v; } },
        { get: k => G[k], set: (k, v) => { G[k] = v; } }, { get: k => ctx[k], set: (k, v) => { ctx[k] = v; } }, { get: k => ENV[k] }];
    const obj = { run: (msg) => api(n.func)(...args(msg)), warns, errors, statuses, sent, ctx,
                  init: () => n.initialize && api(n.initialize)(...args({})), fin: () => n.finalize && api(n.finalize)(...args({})) };
    return obj;
}

// ---------- DDL do fluxo == db/outbox_telemetry.sql ----------
const sqlFile = fs.readFileSync(path.join(ROOT, "db", "outbox_telemetry.sql"), "utf8");
const strip = s => s.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
const ddl = /db\.exec\(`([\s\S]*?)`\);/.exec(node_("Ponte: grava na outbox (SQLite)").initialize)[1];
assert.ok(strip(sqlFile).includes(strip(ddl)), "DDL do fluxo diferente de db/outbox_telemetry.sql");
console.log("ok  DDL da ponte igual ao db/outbox_telemetry.sql (outbox_telemetry + audit_comandos)");

// ---------- guarda da URL: só wss://, nunca Vercel, token fora da URL ----------
for (const [url, tok, re] of [["ws://smart40-broker.example", "x", /wss:\/\//], ["wss://app.vercel.app/ws", "x", /Vercel/],
                              ["wss://smart40-broker.example?token=EXEMPLO", "x", /token/], ["wss://smart40-broker.example", "", /SMART40_AGENT_TOKEN/],
                              ["", "x", /SMART40_BROKER_URL/]]) {
    const n0 = broker.sockets.length;
    const c = mk("Ponte: cliente WSS → smart40-broker", Object.assign({}, ENV_PONTE, { SMART40_BROKER_URL: url, SMART40_AGENT_TOKEN: tok }), {});
    c.init();
    assert.ok(c.errors.some(e => re.test(e)), "deveria recusar " + url); assert.strictEqual(broker.sockets.length, n0, "não pode abrir socket");
}
console.log("ok  cliente recusa ws://, URL da Vercel, token na URL e falta de URL/token (nenhum socket aberto)");

// ---------- pipeline: simulador -> normaliza -> montarTelemetria -> envelope -> outbox -> cliente ----------
const sim = mk("Simulador CLP", ENV_ING, FLOWCTX.ing), fonte = mk("Fonte ativa (INPUT_MODE)", ENV_ING, FLOWCTX.ing);
const norm = mk("Normaliza CLP → amostra", ENV_ING, FLOWCTX.ing), montar = mk("montarTelemetria", ENV_CMD, FLOWCTX.cmd);
const env_ = mk("Ponte: monta envelope (contrato)", ENV_PONTE, FLOWCTX.ponte);
const grava = mk("Ponte: grava na outbox (SQLite)", ENV_PONTE, FLOWCTX.ponte);
const cli = mk("Ponte: cliente WSS → smart40-broker", ENV_PONTE, FLOWCTX.ponte);
const classif = mk("Ponte: classifica mensagens do broker", ENV_PONTE, FLOWCTX.ponte);
const validar = mk("validarComando", ENV_CMD, FLOWCTX.cmd), aplicar = mk("aplicarComando", ENV_CMD, FLOWCTX.cmd);
const rotear = mk("rotear ack (local × ponte WSS)", ENV_CMD, FLOWCTX.cmd), pulso = mk("Pulso S7 (TRUE → FALSE após CLP_PULSE_MS)", ENV_CMD, FLOWCTX.cmd);
grava.init(); env_.init(); cli.init();
const db = G.ponte_db; assert.ok(db, "outbox da ponte aberta");
const q = (s, ...a) => db.prepare(s).all(...a);
const n = (st) => db.prepare("SELECT COUNT(*) AS n FROM outbox_telemetry WHERE status = ?").get(st).n;

let ticks = 0;
function cadaPasso() {                                   // a cada 100 ms: leitura do "CLP"
    ticks++;
    const m = sim.run({ payload: clock }); if (m) { const [a] = fonte.run(m); if (a) montar.run(norm.run(a)); }
    if (ticks % 5 === 0) {                               // a cada 500 ms: envelope + tick do despachante
        const e = env_.run({}); if (e) { const t = grava.run(e); if (t) cli.run(t); }
        cli.run({ topic: "__tick__" });
    }
}
// cliente da saída 1 -> classifica -> validar -> switch/aplicar -> rotear -> cliente (ack)
function processaSaidas() {
    while (saidas.length) {
        const { name, m } = saidas.shift();
        if (name !== "Ponte: cliente WSS → smart40-broker" || !m[0]) continue;
        const [cmd] = classif.run(m[0]); if (!cmd) continue;
        const [ok, nack] = validar.run(cmd);
        const acks = [];
        if (nack) acks.push(nack);
        if (ok) { const [toSim, ack, toS7] = aplicar.run(ok); if (toSim) sim.run(toSim); acks.push(ack); if (toS7) pulso.run(toS7); }
        for (const a of acks) { const [, viaWss] = rotear.run(a); if (viaWss) cli.run(viaWss); }
    }
}
const passo = () => { cadaPasso(); processaSaidas(); };

avanca(3000, 100, passo);
const ws = broker.sockets[broker.sockets.length - 1];
assert.strictEqual(ws.readyState, 1); assert.ok(ws.url.startsWith("wss://smart40-broker.example?token="));
const tel = broker.recebidos.filter(f => f.meta);
assert.ok(tel.length >= 5, "frames de telemetria chegando: " + tel.length);
const f0 = tel[tel.length - 1];
for (const k of ["timestamp", "roboUR", "esteira", "estacoes", "pedidoAtual"]) assert.ok(k in f0, "campo do contrato: " + k);
assert.match(f0.timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
assert.deepStrictEqual(Object.keys(f0.roboUR.posicaoCartesiana), ["x", "y", "z"]); assert.strictEqual(f0.roboUR.posicaoJuntas.length, 6);
assert.deepStrictEqual(Object.keys(f0.estacoes).sort(), ["estoque", "expedicao", "montagem", "processo"]);
for (const e of Object.values(f0.estacoes)) assert.ok(["AGUARDANDO", "OPERANDO", "EMERGENCIA"].includes(e.status) && typeof e.magazine === "number");
assert.strictEqual(f0.meta.stale, false); assert.strictEqual(f0.meta.amostras, 5); assert.strictEqual(f0.meta.origem_dados, "SIMULATOR");
const dts = tel.slice(1).map((f, i) => Date.parse(f.timestamp) - Date.parse(tel[i].timestamp));
assert.ok(dts.every(d => d === 500), "um frame a cada 500 ms: " + dts.join(","));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts", "events", "envelope-ponte-wss.schema.json"), "utf8"));
function conforme(obj, sch, onde) {
    if (sch.$ref) sch = SCHEMA.$defs[sch.$ref.split("/").pop()];
    for (const k of sch.required || []) assert.ok(obj && k in obj, "schema: falta " + onde + "." + k);
    if (sch.enum) assert.ok(sch.enum.includes(obj), "schema: " + onde + " fora do enum: " + obj);
    if (sch.const) assert.strictEqual(obj, sch.const);
    for (const [k, sub] of Object.entries(sch.properties || {})) if (obj && obj[k] !== undefined) conforme(obj[k], sub, onde + "." + k);
}
for (const f of tel) conforme(f, SCHEMA, "frame");
console.log("ok  envelope do contrato a cada 500 ms (timestamp ISO UTC, roboUR, esteira, 4 estações, pedidoAtual, meta)");
assert.ok(n("SENT") >= tel.length - 3 && n("PENDING") === 0, "confirmados após o período de graça");
console.log("ok  outbox: frame gravado antes do envio e confirmado (SENT) só após 1 s com a conexão aberta");

// ---------- buffer cheio no socket: não confirma ----------
ws.bufferedAmount = 1000; const sentAntes = n("SENT"); avanca(1500, 100, passo);
assert.strictEqual(n("SENT"), sentAntes, "com bufferedAmount > 0 não confirma"); ws.bufferedAmount = 0; avanca(1500, 100, passo);
assert.ok(n("SENT") > sentAntes); console.log("ok  com dados ainda no buffer do socket, nada é confirmado");

// ---------- queda do link: retém, reconecta em 5000 ms e reenvia em ordem ----------
broker.aceita = false; const antesQueda = broker.recebidos.length;
ws.cair(1006, "");                                          // cabo desconectado
avanca(20000, 100, passo);                                  // 20 s sem broker
assert.strictEqual(broker.recebidos.length, antesQueda, "nada enviado offline");
assert.ok(n("PENDING") >= 38, "frames retidos na outbox: " + n("PENDING"));
const retidos = q("SELECT created_offline, last_error FROM outbox_telemetry WHERE status='PENDING'");
assert.ok(retidos.every(r => r.created_offline === 1 || /conexao caiu/.test(r.last_error || "")), "retidos = gravados offline ou devolvidos pela queda");
const tentativas = broker.sockets.length; broker.aceita = true;
avanca(6000, 100, passo);
assert.strictEqual(broker.sockets[broker.sockets.length - 1].readyState, 1, "reconectou");
avanca(8000, 100, passo);
assert.strictEqual(n("PENDING") + n("INFLIGHT") <= 3, true, "outbox drenada");
const todos = broker.recebidos.filter(f => f.meta);
const unicos = new Map(); for (const f of todos) unicos.set(f.meta.msg_id, f);
const seqs = [...unicos.values()].map(f => f.meta.seq);
for (let i = 1; i < seqs.length; i++) assert.strictEqual(seqs[i], seqs[i - 1] + 1, "sem lacunas de seq");
const ord = todos.map(f => f.meta.seq); const posQueda = ord.slice(antesQueda);
assert.ok(posQueda.every((s, i) => i === 0 || s === posQueda[i - 1] + 1), "replay em ordem estrita após a reconexão: " + posQueda.slice(0, 8).join(","));
assert.ok(posQueda[0] <= ord[antesQueda - 1] + 1, "replay começa no primeiro frame não confirmado");
const ts = [...unicos.values()].map(f => Date.parse(f.timestamp));
assert.ok(ts.slice(1).every((t, i) => t - ts[i] === 500), "sem lacunas temporais");
assert.ok(todos.slice(antesQueda).filter(f => f.meta.buffered).length >= 38, "frames da queda saem com buffered=true");
console.log("ok  queda de 20 s: " + posQueda.length + " frames retidos/reenviados em ordem, seq e timestamps sem lacunas, buffered=true");

// reconexão a cada 5000 ms (não 3000)
const aberturas = []; let ultimo = broker.sockets.length;
broker.aceita = false; broker.sockets[broker.sockets.length - 1].cair(1006, "");
avanca(16000, 100, () => { passo(); if (broker.sockets.length !== ultimo) { aberturas.push(clock); ultimo = broker.sockets.length; } });
const intervalos = aberturas.slice(1).map((t, i) => t - aberturas[i]);
assert.ok(intervalos.length >= 2 && intervalos.every(d => d >= 5000 && d <= 5200), "reconexão a cada 5000 ms: " + intervalos.join(","));
broker.aceita = true; avanca(8000, 100, passo);
console.log("ok  tentativas de reconexão a cada ~5000 ms (" + intervalos.join(", ") + " ms)");

// duplicidade: só pode haver repetição de msg_id (reenvio), nunca dois frames diferentes com o mesmo seq
const porSeq = new Map(); for (const f of broker.recebidos.filter(f => f.meta)) { const k = f.meta.seq; if (!porSeq.has(k)) porSeq.set(k, new Set()); porSeq.get(k).add(f.meta.msg_id); }
assert.ok([...porSeq.values()].every(s => s.size === 1)); console.log("ok  nenhum seq com dois msg_id: duplicatas de reenvio são deduplicáveis por meta.msg_id");

// ---------- token recusado (4001) ----------
const wsNow = broker.sockets[broker.sockets.length - 1];
broker.tokenValido = "outro"; wsNow.cair(1006, ""); avanca(6000, 100, passo);
assert.ok(cli.warns.some(w => /4001/.test(w))); broker.tokenValido = "token-teste"; avanca(6000, 100, passo);
assert.strictEqual(broker.sockets[broker.sockets.length - 1].readyState, 1);
console.log("ok  código 4001 (token errado) registrado em node.warn; volta a conectar com o token certo");

// ---------- derrubar/restaurar link pelo botão de teste ----------
cli.run({ topic: "__force_offline__" }); const nf = broker.recebidos.length; avanca(10000, 100, passo);
assert.strictEqual(broker.recebidos.length, nf, "link derrubado: nada sai"); assert.ok(n("PENDING") >= 18);
cli.run({ topic: "__force_online__" }); avanca(6000, 100, passo); assert.ok(n("PENDING") <= 2, "drenou após restaurar");
console.log("ok  inject de teste derruba e restaura o link (resiliência sem mexer no cabo)");

// ---------- canal de comandos pela ponte ----------
const sock = () => broker.sockets[broker.sockets.length - 1];
const acks = () => broker.recebidos.filter(f => f.tipo === "ack");
const ultimoAck = () => acks()[acks().length - 1];
const ultimoFrame = () => broker.recebidos.filter(f => f.meta).slice(-1)[0];
const aud = () => q("SELECT * FROM audit_comandos ORDER BY id DESC LIMIT 1")[0];

sock().chega({ acao: "START", origem: "unidade1-grupo4", id: "c1" }); processaSaidas(); avanca(2000, 100, passo);
assert.ok(ultimoAck().aceito && ultimoAck().id === "c1" && ultimoAck().destino === "SIMULADOR");
assert.strictEqual(ultimoFrame().estacoes.processo.status, "OPERANDO"); assert.strictEqual(ultimoFrame().esteira.motorLigado, true);
assert.strictEqual(aud().canal, "wss"); assert.strictEqual(aud().decisao, "ACEITO");
console.log("ok  START de unidade1-grupo4 via broker: ack pelo mesmo socket, telemetria OPERANDO, auditado");

for (const o of ["unidade1-grupo1", "unidade1-grupo2", "unidade1-grupo3", "unidade1-grupo5"]) {
    sock().chega({ acao: "STOP", origem: o, id: "s-" + o }); processaSaidas(); assert.ok(ultimoAck().aceito, o);
}
sock().chega({ acao: "START", origem: "unidade9-intruso", id: "x1" }); processaSaidas();
assert.strictEqual(ultimoAck().aceito, false); assert.match(ultimoAck().motivo, /origem/);
assert.ok(validar.warns.some(w => /unidade9-intruso/.test(w)), "rejeição registrada via node.warn");
assert.strictEqual(aud().decisao, "REJEITADO");
console.log("ok  whitelist unidade1-grupo1..5 aceita; origem fora da lista rejeitada com node.warn + auditoria");

sock().chega({ acao: "EMERGENCY_STOP", origem: "unidade9-intruso", id: "e1" }); processaSaidas(); avanca(1500, 100, passo);
assert.ok(ultimoAck().aceito); assert.ok(Object.values(ultimoFrame().estacoes).every(e => e.status === "EMERGENCIA"));
console.log("ok  EMERGENCY_STOP bypassa a whitelist (origem desconhecida aceita) -> todas as estações EMERGENCIA");
sock().chega({ acao: "RESET", origem: "unidade1-grupo1", id: "r1" }); processaSaidas(); avanca(1500, 100, passo);
assert.strictEqual(ultimoFrame().estacoes.processo.status, "AGUARDANDO");

// pulso de emergência de 100 ms dentro da janela: o frame de 500 ms mostra EMERGENCIA
G.telemetria_janela = { n: 3, emerg: true }; const fr = env_.run({});
assert.ok(Object.values(fr.payload.estacoes).every(e => e.status === "EMERGENCIA"));
console.log("ok  emergência vista em qualquer leitura da janela aparece no frame (não se perde entre 100 e 500 ms)");

// ---------- escrita no CLP: bloqueada sem autorização, pulso com autorização ----------
G.input_mode_ingestao = "CLP"; ENV_ING.INPUT_MODE = "CLP";
const s7 = []; pulso.sent.length = 0;
sock().chega({ acao: "START", origem: "unidade1-grupo4", id: "w1" }); processaSaidas();
assert.strictEqual(ultimoAck().aceito, false); assert.match(ultimoAck().motivo, /autorização escrita/);
assert.strictEqual(aud().destino, "NENHUM"); assert.ok(aplicar.warns.some(w => /bloqueada/.test(w)));
ENV_CMD.CLP_WRITE_AUTHORIZED = "true";
sock().chega({ acao: "START", origem: "unidade1-grupo4", id: "w2" }); processaSaidas();
assert.strictEqual(ultimoAck().aceito, false, "sem a referência do documento continua bloqueado");
ENV_CMD.CLP_WRITE_AUTH_REF = "docs/evidence/sprint3/G1-S3-autorizacao-escrita-clp.md";
const r = aplicar.run({ comando: { acao: "STOP", origem: "unidade1-grupo2", id: "w3" }, _via: "wss" });
assert.ok(r[1].payload.aceito && r[1].payload.destino === "CLP"); assert.strictEqual(aud().escrita_status, "ENVIADA");
const o1 = pulso.run(r[2]);
assert.deepStrictEqual(o1.map(x => x && x.payload), [null, true, null, null], "STOP -> saída 2 (DB1,X0.5) = TRUE");
avanca(600, 100);
const o2 = pulso.sent[pulso.sent.length - 1]; assert.deepStrictEqual(o2.map(x => x && x.payload), [null, false, null, null]);
G.auditar_escrita(r[2].audit_id, "CONFIRMADA"); assert.strictEqual(aud().escrita_status, "CONFIRMADA");
const outs = FLOW.filter(x => x.type === "s7 out").map(x => x.variable);
const vt = Object.fromEntries(FLOW.find(x => x.id === "s3_s7_cmd_endpoint").vartable.map(v => [v.name, v.addr]));
assert.deepStrictEqual(outs.map(v => vt[v]), ["DB1,X0.4", "DB1,X0.5", "DB1,X0.6", "DB1,X0.7"]);
for (const [ac, i] of [["START", 0], ["RESET", 2], ["EMERGENCY_STOP", 3]]) {
    const o = pulso.run({ acao: ac }); assert.strictEqual(o[i].payload, true);
}
G.input_mode_ingestao = "REPLAY"; const rr = aplicar.run({ comando: { acao: "START", origem: "unidade1-grupo1" }, _via: "wss" });
assert.strictEqual(rr[1].payload.aceito, false); assert.strictEqual(rr[2], null);
G.input_mode_ingestao = "SIMULADOR"; ENV_ING.INPUT_MODE = "SIMULADOR"; delete ENV_CMD.CLP_WRITE_AUTHORIZED; delete ENV_CMD.CLP_WRITE_AUTH_REF;
console.log("ok  escrita no CLP: bloqueada sem CLP_WRITE_AUTHORIZED + CLP_WRITE_AUTH_REF; com autorização, pulso TRUE→FALSE em DB1,X0.4..X0.7");

// ---------- modo ECHO: confirma pelo eco do broker ----------
const ENV_ECHO = Object.assign({}, ENV_PONTE, { WSS_CONFIRM: "ECHO" });
cli.fin(); avanca(200, 100);
const cli2 = mk("Ponte: cliente WSS → smart40-broker", ENV_ECHO, FLOWCTX.ponte); cli2.init(); broker.echo = true;
avanca(300, 100);
const sentAntesEcho = n("SENT");
for (let i = 0; i < 6; i++) { const e = env_.run({}); grava.run(e); cli2.run({ topic: "__tick__" }); avanca(100, 100); }
avanca(500, 100); cli2.run({ topic: "__tick__" }); avanca(200, 100);
assert.ok(n("SENT") >= sentAntesEcho + 6, "eco confirma"); assert.strictEqual(n("INFLIGHT"), 0);
broker.echo = false;
for (let i = 0; i < 3; i++) { const e = env_.run({}); grava.run(e); cli2.run({ topic: "__tick__" }); }
avanca(5600, 100, () => cli2.run({ topic: "__tick__" }));
assert.ok(q("SELECT attempts FROM outbox_telemetry ORDER BY id DESC LIMIT 3").every(x => x.attempts >= 2), "sem eco: reenviado");
console.log("ok  WSS_CONFIRM=ECHO: eco do broker confirma; sem eco em 5 s, reenvia a partir do mais antigo");
cli2.fin();

console.log("\nTODOS OS TESTES DA PONTE WSS (SPRINT 3) PASSARAM");
