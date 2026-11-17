#!/usr/bin/env node
// =============================================================================
// ENSAIO LOCAL da ponte borda-nuvem (Sprint 3) — sem bancada e sem o broker real.
// Sobe o broker de ensaio (wss://localhost:8443, certificado autoassinado), um Node-RED
// temporário com o flow_ingestao_n2.json + settings.js do repositório (INPUT_MODE=SIMULADOR)
// e roda: Teste A, Teste C, canal de comandos, resiliência (queda do broker e queda do link
// pelo inject de teste) e Teste B (INPUT_MODE=TESTE_B).
// Relatório: docs/evidence/sprint3/G1-S3-ensaio-local-AAAA-MM-DD.md
//
// NÃO substitui os testes na bancada com o broker real (tools/teste-ponte-g1.js): serve para
// provar a lógica antes da janela de teste e para ensaiar o roteiro.
//
// Uso:  cd tools && npm install
//       node ensaio-ponte-local.js [--node-red caminho/red.js] [--modulos caminho/node_modules] [--duracao-c 20]
//   --node-red : red.js do Node-RED (padrão: instalação global, `npm root -g`/node-red/red.js)
//   --modulos  : pasta node_modules que contém node-red-contrib-s7 (padrão: ~/.node-red/node_modules)
// =============================================================================
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const { spawn, execSync } = require("child_process");
const broker = require("./mock-broker-smart40");
const T = require("./teste-ponte-g1");
const ROOT = path.join(__dirname, "..");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };

const CERT_DIR = path.join(__dirname, ".mock-broker");
const { cert } = broker.certificado(CERT_DIR);
if (process.env.NODE_EXTRA_CA_CERTS !== cert) {            // a CA extra só vale se definida na partida do processo
    const c = spawn(process.execPath, process.argv.slice(1), { stdio: "inherit", env: Object.assign({}, process.env, { NODE_EXTRA_CA_CERTS: cert }) });
    c.on("exit", (code) => process.exit(code));
    return;
}

const PORTA_NR = Number(arg("--porta-nr", 18800)), PORTA_BROKER = Number(arg("--porta-broker", 8443));
const TOK_AGENTE = "agente-local", TOK_OBS = "observador-local";
const hoje = new Date().toISOString().slice(0, 10);
const LOG = path.join(ROOT, "docs", "evidence", "sprint3", `G1-S3-ensaio-local-${hoje}.md`);
const cfg = { url: "wss://localhost:" + PORTA_BROKER, token: TOK_OBS, tokenEnv: "(token do broker de ensaio)", janela: 500,
              duracao: Number(arg("--duracao-c", 20)), origem: "unidade1-grupo1", acao_ms: 1200, log: LOG, semLog: false, confirmo: true, prefixo: "[ENSAIO LOCAL] " };

function redJs() {
    const p = arg("--node-red");
    if (p) return p;
    try { return require.resolve("node-red/red.js"); } catch (e) {}
    const g = execSync("npm root -g").toString().trim();
    return path.join(g, "node-red", "red.js");
}
function get(p) {
    return new Promise((ok, erro) => http.get({ host: "127.0.0.1", port: PORTA_NR, path: p }, (r) => {
        let b = ""; r.on("data", d => b += d); r.on("end", () => { try { ok(JSON.parse(b)); } catch (e) { ok(b); } });
    }).on("error", erro));
}
function post(p) {
    return new Promise((ok, erro) => { const req = http.request({ host: "127.0.0.1", port: PORTA_NR, path: p, method: "POST" }, (r) => { r.resume(); r.on("end", () => ok(r.statusCode)); }); req.on("error", erro); req.end(); });
}

let nr = null, nrLog = "";
function logNodeRed(fase) {
    const linhas = nrLog.split("\n");
    const erros = linhas.filter(l => /\[error\]/.test(l)), avisos = linhas.filter(l => /\[warn\]/.test(l));
    const resumo = (arr) => { const m = new Map(); for (const l of arr) { const k = l.replace(/^.*?\] /, "").replace(/\d+\.\d+\.\d+\.\d+(:\d+)?/g, "<ip>").replace(/Na outbox: \d+/, "Na outbox: N").replace(/(localhost:)\d+/, "$1<porta>").slice(0, 160); m.set(k, (m.get(k) || 0) + 1); } return [...m].map(([k, n]) => `${n}× ${k}`); };
    T.registrar(cfg, "Log do Node-RED na fase " + fase + " (erros e avisos agrupados)", "INFO",
        ["```", ...resumo(erros).slice(0, 12), "--- avisos ---", ...resumo(avisos).slice(0, 12), "```"].join("\n"));
    nrLog = "";
}
async function subirNodeRed(modo) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "g1-ensaio-"));
    fs.copyFileSync(path.join(ROOT, "node-red", "settings.js"), path.join(dir, "settings.js"));
    const flow = JSON.parse(fs.readFileSync(path.join(ROOT, "node-red", "flow_ingestao_n2.json"), "utf8"));
    const tab = flow.find(n => n.type === "tab" && /Ingestão/.test(n.label));
    tab.env.find(e => e.name === "INPUT_MODE").value = modo;
    fs.writeFileSync(path.join(dir, "flows.json"), JSON.stringify(flow, null, 2));
    const mods = arg("--modulos", path.join(os.homedir(), ".node-red", "node_modules"));
    if (fs.existsSync(mods)) fs.symlinkSync(mods, path.join(dir, "node_modules"), "junction");
    nr = spawn(process.execPath, [redJs(), "-u", dir, "-p", String(PORTA_NR)], {
        env: Object.assign({}, process.env, { SMART40_BROKER_URL: cfg.url, SMART40_AGENT_TOKEN: TOK_AGENTE, PORT: String(PORTA_NR),
                                              OUTBOX_PATH: path.join(dir, "outbox_n2.sqlite"), PONTE_OUTBOX_PATH: path.join(dir, "ponte.sqlite") }) });
    nr.stdout.on("data", d => { nrLog += d; }); nr.stderr.on("data", d => { nrLog += d; });
    for (let i = 0; i < 120; i++) {
        await sleep(500);
        try { const s = await get("/edge/ponte"); if (s && s.ponte && s.ponte.online) return dir; } catch (e) {}
    }
    throw new Error("Node-RED não ficou online na ponte. Log:\n" + nrLog.slice(-3000));
}
async function pararNodeRed() { if (!nr) return; nr.kill("SIGTERM"); await new Promise(r => nr.once("exit", r)); nr = null; await sleep(500); }

async function resiliencia(titulo, derrubar, restaurar, segundosFora) {
    const obs = T.observador(cfg.url, cfg.token);
    const inicio = Date.now();
    await sleep(5000);
    await derrubar();
    const s0 = await get("/edge/ponte").catch(() => null);
    await sleep(segundosFora * 1000);
    const naFila = (await get("/edge/ponte")).outbox;
    await restaurar();
    await sleep(12000);
    obs.fechar();
    const m = T.analisar(obs.frames, { janelaMs: 500, inicio, fim: Date.now() });
    const res = m.buffered === 0 ? "BLOCKED" : (m.lacunas_seq.length || m.lacunas_tempo.length || m.fora_de_ordem ? "FAIL" : "PASS");
    T.registrar(cfg, titulo, res, [T.tabelaMetricas(m), "", T.NOTA_LAT, "",
        `- Link fora por ${segundosFora} s. Outbox no fim da queda: PENDING ${naFila.PENDING} · INFLIGHT ${naFila.INFLIGHT}.`,
        `- Quedas do próprio observador: ${obs.quedas} (na queda do broker o observador também cai e reconecta).`].join("\n"));
    return res === "PASS";
}

(async function main() {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.writeFileSync(LOG, [`# Ensaio local da ponte borda-nuvem — Grupo 1 · Sprint 3 · ${hoje}`, "",
        "Gerado por `tools/ensaio-ponte-local.js`: broker de ensaio local (`wss://localhost`, certificado autoassinado,",
        "token na query, 4001 para token errado, relay entre clientes) + Node-RED temporário com o",
        "`flow_ingestao_n2.json` e o `settings.js` do repositório, CLP simulado.", "",
        "> **Escopo:** ensaio da lógica sem hardware e sem o broker real. NÃO substitui os testes na bancada",
        "> (`tools/teste-ponte-g1.js` contra `wss://smart40-broker.onrender.com`), que são a evidência do Portão 3.", ""].join("\n"));
    const resultados = {};
    let b = await broker.iniciar({ porta: PORTA_BROKER, certDir: CERT_DIR, tokens: [TOK_AGENTE, TOK_OBS].join(","), silencioso: true });
    try {
        console.error("Node-RED (SIMULADOR) subindo...");
        await subirNodeRed("SIMULADOR");
        resultados.A = await T.testeA(cfg);
        resultados.C = await T.testeC(cfg, "Teste C — consumo a cada 500 ms");
        resultados.comandos = await T.testeComandos(cfg);
        const audit = await get("/edge/comandos?limit=30");
        const warns = (nrLog.match(/Comando rejeitado de origem: [^\n]*/g) || []);
        T.registrar(cfg, "Auditoria do canal de comandos (GET /edge/comandos)", audit.length ? "PASS" : "FAIL",
            ["Últimos registros da tabela `audit_comandos`:", "", "| ts | canal | ação | origem | decisão | motivo | destino |", "|---|---|---|---|---|---|---|",
             ...audit.slice(0, 15).map(r => `| ${r.ts} | ${r.canal} | ${r.acao} | ${r.origem} | ${r.decisao} | ${r.motivo || ""} | ${r.destino || ""} |`), "",
             "`node.warn` capturado no log do Node-RED:", "", "```", ...warns.slice(0, 5), "```"].join("\n"));
        resultados.queda_broker = await resiliencia("Resiliência — broker fora por 20 s", async () => { await b.fechar(); },
            async () => { b = await broker.iniciar({ porta: PORTA_BROKER, certDir: CERT_DIR, tokens: [TOK_AGENTE, TOK_OBS].join(","), silencioso: true }); }, 20);
        resultados.queda_link = await resiliencia("Resiliência — link da borda derrubado pelo inject de teste por 30 s",
            async () => { await post("/inject/s3_inj_off"); }, async () => { await post("/inject/s3_inj_on"); }, 30);
        const st = await get("/edge/ponte");
        T.registrar(cfg, "Estado da ponte no fim (GET /edge/ponte)", "INFO", "```json\n" + JSON.stringify(st.ponte, null, 2) + "\n```\nOutbox: " + JSON.stringify(st.outbox));
        logNodeRed("SIMULADOR");
        await pararNodeRed();

        console.error("Node-RED (CLP, sem autorização de escrita) subindo...");
        await subirNodeRed("CLP");
        await T.testeComandos(Object.assign({}, cfg, { prefixo: "[ENSAIO LOCAL · INPUT_MODE=CLP sem autorização] " }));
        const aud = await get("/edge/comandos?limit=30");
        const escritas = aud.filter(r => r.destino === "CLP");
        const bloqueados = aud.filter(r => /bloqueada/.test(r.motivo || ""));
        resultados.clp_sem_autorizacao = escritas.length === 0 && bloqueados.length > 0;
        T.registrar(cfg, "Escrita no CLP sem autorização escrita (INPUT_MODE=CLP)", resultados.clp_sem_autorizacao ? "PASS" : "FAIL",
            [`- Comandos auditados: ${aud.length} · encaminhados ao CLP: ${escritas.length} · bloqueados por falta de autorização: ${bloqueados.length}.`,
             "- Sem CLP_WRITE_AUTHORIZED=true **e** CLP_WRITE_AUTH_REF preenchido, nenhum comando chega aos nós s7 out.",
             "- Neste ensaio não há CLP na rede: o endpoint S7 apenas registra erro de conexão (esperado)."].join("\n"));
        logNodeRed("CLP");
        await pararNodeRed();

        console.error("Node-RED (TESTE_B) subindo...");
        await subirNodeRed("TESTE_B");
        cfg.duracao = 8;
        resultados.B = await T.testeB(cfg);
        logNodeRed("TESTE_B");
    } catch (e) {
        T.registrar(cfg, "Erro", "FAIL", "```\n" + (e.stack || e) + "\n```");
        process.exitCode = 1;
    } finally {
        await pararNodeRed();
        await b.fechar();
    }
    const linhas = Object.entries(resultados).map(([k, v]) => `| ${k} | ${v ? "PASS" : "FAIL"} |`);
    fs.appendFileSync(LOG, ["", "---", "", "## Resumo do ensaio", "", "| Teste | Resultado |", "|---|---|", ...linhas, ""].join("\n"));
    console.error("\nResumo:\n" + linhas.join("\n") + "\nRelatório: " + path.relative(ROOT, LOG));
    if (Object.values(resultados).some(v => !v)) process.exitCode = 1;
})();
