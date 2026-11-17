#!/usr/bin/env node
// =============================================================================
// Bateria de testes da ponte borda-nuvem — Grupo 1 · Sprint 3 (roteiro, passos 6, 7 e 11)
// Cliente WebSocket nativo do Node.js >= 22 (sem dependências). Cada execução
// acrescenta uma seção com data, versão e resultado em docs/evidence/sprint3/log_testes_ponte_g1.md.
//
// Configuração (variáveis de ambiente, NUNCA no Git):
//   SMART40_BROKER_URL   wss://smart40-broker.onrender.com        (sem token)
//   SMART40_TEST_TOKEN   token de teste do grupo (ex.: o do G1)   (nunca é impresso)
//
// Testes:
//   node tools/teste-ponte-g1.js A                        conexão com token certo + token errado (espera 4001)
//   node tools/teste-ponte-g1.js B --duracao 10           payload sintético (INPUT_MODE=TESTE_B no Node-RED)
//   node tools/teste-ponte-g1.js C --duracao 60           frames a cada 500 ms (equivalente ao console da SPA)
//   node tools/teste-ponte-g1.js resiliencia --duracao 300   desconecte o cabo da bancada por 2 min no meio
//   node tools/teste-ponte-g1.js comandos --confirmo-bancada-segura [--origem unidade1-grupo1]
//   node tools/teste-ponte-g1.js continuidade --duracao 1800  critério do Portão 3 (30 min contínuos)
// Opções: --url  --token-env NOME  --log caminho  --sem-log  --janela-ms 500
// =============================================================================
const fs = require("fs"), path = require("path"), crypto = require("crypto"), { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const LOG_PADRAO = path.join(ROOT, "docs", "evidence", "sprint3", "log_testes_ponte_g1.md");

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };
const r0 = (x) => x === null || x === undefined ? "—" : Math.round(x);
const semToken = (u) => String(u || "").split("?")[0];

function versao() {
    let git = "sem git";
    try { git = execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch (e) {}
    let fluxo = "?";
    try { fluxo = crypto.createHash("sha256").update(fs.readFileSync(path.join(ROOT, "node-red", "flow_ingestao_n2.json"))).digest("hex").slice(0, 12); } catch (e) {}
    return "commit " + git + " · flow_ingestao_n2.json sha256 " + fluxo;
}

// Abre um socket e devolve { ws, aberto, fechado } (promises). Nunca lança.
function conectar(url, token, onMsg) {
    const WS = globalThis.WebSocket;
    if (typeof WS !== "function") throw new Error("Node.js sem WebSocket nativo: use Node.js 22.13+");
    if (!/^wss:\/\//i.test(url)) throw new Error("URL deve começar com wss:// (ws:// é proibido)");
    const ws = new WS(url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token));
    let resolveAberto, resolveFechado;
    const aberto = new Promise(r => { resolveAberto = r; });
    const fechado = new Promise(r => { resolveFechado = r; });
    const t0 = Date.now();
    ws.addEventListener("open", () => resolveAberto({ ok: true, ms: Date.now() - t0 }));
    ws.addEventListener("close", (ev) => { resolveAberto({ ok: false, code: ev.code }); resolveFechado({ code: ev.code, reason: ev.reason, ms: Date.now() - t0 }); });
    // Node.js 22: conexão recusada dispara só "error" (sem "close"); trata como 1006.
    ws.addEventListener("error", () => setTimeout(() => { resolveAberto({ ok: false, code: 1006 }); resolveFechado({ code: 1006, reason: "erro de rede", ms: Date.now() - t0 }); }, 300));
    ws.addEventListener("message", (ev) => {
        if (!onMsg) return;
        let d; try { d = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString()); } catch (e) { return; }
        onMsg(d, Date.now());
    });
    return { ws, aberto, fechado };
}

// Observador que se reconecta sozinho (para continuar vendo o replay depois de uma queda).
function observador(url, token, { onMsg, reconectar = true } = {}) {
    const st = { frames: [], outros: [], conexoes: 0, quedas: 0, parar: false, atual: null };
    const recebe = (d, t) => { if (d && d.estacoes && d.timestamp) st.frames.push({ t, f: d }); else st.outros.push({ t, d }); if (onMsg) onMsg(d, t); };
    (async function loop() {
        while (!st.parar) {
            const c = conectar(url, token, recebe); st.atual = c;
            const a = await c.aberto;
            if (a.ok) { st.conexoes++; const f = await c.fechado; if (!st.parar) st.quedas++; if (f.code === 4001) { st.erro4001 = true; break; } }
            if (!reconectar || st.parar) break;
            await sleep(300);
        }
    })();
    st.enviar = (obj) => { const w = st.atual && st.atual.ws; if (w && w.readyState === 1) { w.send(JSON.stringify(obj)); return true; } return false; };
    st.fechar = () => { st.parar = true; try { st.atual && st.atual.ws.close(1000); } catch (e) {} };
    return st;
}

// Análise dos frames recebidos (dedup por meta.msg_id, lacunas de seq e de tempo, cadência, latência).
function analisar(frames, { janelaMs = 500, inicio, fim } = {}) {
    const unicos = new Map(); let duplicados = 0, semMeta = 0;
    for (const x of frames) {
        const id = x.f.meta && x.f.meta.msg_id;
        if (!id) { semMeta++; unicos.set("semmeta-" + unicos.size, x); continue; }
        if (unicos.has(id)) { duplicados++; continue; }
        unicos.set(id, x);
    }
    const lista = [...unicos.values()];
    const porBoot = {};
    for (const x of lista) { const b = (x.f.meta && x.f.meta.boot) || "?"; (porBoot[b] = porBoot[b] || []).push(x); }
    const lacunasSeq = [], lacunasTempo = []; let foraDeOrdem = 0;
    for (const [boot, arr] of Object.entries(porBoot)) {
        const chegada = arr.map(x => x.f.meta ? x.f.meta.seq : null);
        let max = -Infinity; for (const s of chegada) { if (s === null) continue; if (s < max) foraDeOrdem++; max = Math.max(max, s); }
        const ord = arr.filter(x => x.f.meta).sort((a, b) => a.f.meta.seq - b.f.meta.seq);
        for (let i = 1; i < ord.length; i++) {
            const d = ord[i].f.meta.seq - ord[i - 1].f.meta.seq;
            if (d > 1) lacunasSeq.push({ boot, de: ord[i - 1].f.meta.seq, ate: ord[i].f.meta.seq, faltam: d - 1 });
            const dt = Date.parse(ord[i].f.timestamp) - Date.parse(ord[i - 1].f.timestamp);
            if (dt > janelaMs * 1.5) lacunasTempo.push({ boot, apos: ord[i - 1].f.timestamp, ms: dt });
        }
    }
    const vivos = lista.filter(x => !(x.f.meta && x.f.meta.buffered));
    const intervalos = vivos.slice(1).map((x, i) => x.t - vivos[i].t);
    const latencias = vivos.map(x => x.t - Date.parse(x.f.timestamp));
    const cadencia = lista.filter(x => x.f.meta).sort((a, b) => a.f.meta.seq - b.f.meta.seq);
    const passos = cadencia.slice(1).map((x, i) => Date.parse(x.f.timestamp) - Date.parse(cadencia[i].f.timestamp)).filter(d => d > 0 && d < janelaMs * 1.5);
    const dur = ((fim || Date.now()) - (inicio || (frames[0] && frames[0].t) || Date.now())) / 1000;
    return {
        recebidos: frames.length, unicos: lista.length, duplicados, sem_meta: semMeta, boots: Object.keys(porBoot).length,
        buffered: lista.filter(x => x.f.meta && x.f.meta.buffered).length, stale: lista.filter(x => x.f.meta && x.f.meta.stale).length,
        reenvios: lista.filter(x => x.f.meta && x.f.meta.reenvio).length,
        lacunas_seq: lacunasSeq, lacunas_tempo: lacunasTempo, fora_de_ordem: foraDeOrdem,
        duracao_s: Math.round(dur), esperado: Math.floor(dur * 1000 / janelaMs),
        passo_timestamp_ms: { p50: pct(passos, 50), max: passos.length ? Math.max(...passos) : null },
        intervalo_chegada_ms: { p50: pct(intervalos, 50), p95: pct(intervalos, 95), max: intervalos.length ? Math.max(...intervalos) : null },
        latencia_ms: { p50: pct(latencias, 50), p95: pct(latencias, 95), max: latencias.length ? Math.max(...latencias) : null },
        latencias_vivas: vivos.map(x => ({ t: x.t, l: x.t - Date.parse(x.f.timestamp) }))
    };
}

// Critério de latência do roteiro (6.4): p95 > 2 s por 5 minutos consecutivos -> PASS WITH LIMITATION.
function latenciaSustentadaAlta(latencias, limiteMs = 2000, minutos = 5) {
    if (!latencias.length) return false;
    const porMin = {};
    for (const x of latencias) { const m = Math.floor(x.t / 60000); (porMin[m] = porMin[m] || []).push(x.l); }
    const ms = Object.keys(porMin).map(Number).sort((a, b) => a - b);
    let seguidos = 0;
    for (let i = 0; i < ms.length; i++) {
        const alto = pct(porMin[ms[i]], 95) > limiteMs;
        seguidos = alto && (i === 0 || ms[i] === ms[i - 1] + 1) ? seguidos + 1 : (alto ? 1 : 0);
        if (seguidos >= minutos) return true;
    }
    return false;
}

function tabelaMetricas(m) {
    return [
        "| Métrica | Valor |", "|---|---|",
        `| Duração observada | ${m.duracao_s} s |`,
        `| Frames recebidos / únicos (por meta.msg_id) | ${m.recebidos} / ${m.unicos} |`,
        `| Esperado a 1 frame por 500 ms | ${m.esperado} |`,
        `| Repetições de reenvio descartadas (msg_id já visto) | ${m.duplicados} |`,
        `| Frames com buffered=true (vieram da outbox) | ${m.buffered} |`,
        `| Frames stale (sem leitura nova na janela) | ${m.stale} |`,
        `| Lacunas de seq | ${m.lacunas_seq.length}${m.lacunas_seq.length ? " → " + JSON.stringify(m.lacunas_seq.slice(0, 5)) : ""} |`,
        `| Lacunas temporais (> 750 ms entre timestamps) | ${m.lacunas_tempo.length}${m.lacunas_tempo.length ? " → " + JSON.stringify(m.lacunas_tempo.slice(0, 5)) : ""} |`,
        `| Chegadas fora de ordem | ${m.fora_de_ordem} |`,
        `| Passo entre timestamps (p50 / máx) | ${r0(m.passo_timestamp_ms.p50)} / ${r0(m.passo_timestamp_ms.max)} ms |`,
        `| Intervalo entre chegadas (p50 / p95 / máx) | ${r0(m.intervalo_chegada_ms.p50)} / ${r0(m.intervalo_chegada_ms.p95)} / ${r0(m.intervalo_chegada_ms.max)} ms |`,
        `| Latência borda→observador (p50 / p95 / máx)¹ | ${r0(m.latencia_ms.p50)} / ${r0(m.latencia_ms.p95)} / ${r0(m.latencia_ms.max)} ms |`,
    ].join("\n");
}

function registrar(cfg, titulo, resultado, corpo) {
    const txt = [
        "", "---", "", `## ${cfg.prefixo || ""}${titulo}`, "",
        `- **Data/hora:** ${new Date().toISOString()} (local: ${new Date().toLocaleString("pt-BR")})`,
        `- **Versão:** ${versao()}`,
        `- **Broker:** ${semToken(cfg.url)} · token lido de \`${cfg.tokenEnv}\` (não registrado)`,
        `- **Executado por:** ${process.env.USERNAME || process.env.USER || "?"} em ${require("os").hostname()}`,
        `- **Resultado:** **${resultado}**`, "", corpo, ""
    ].join("\n");
    console.log(txt);
    if (cfg.semLog) return;
    fs.mkdirSync(path.dirname(cfg.log), { recursive: true });
    if (!fs.existsSync(cfg.log)) fs.writeFileSync(cfg.log, "# Log dos testes da ponte borda-nuvem — Grupo 1 · Sprint 3\n\nGerado por `tools/teste-ponte-g1.js`. Uma seção por execução.\n");
    fs.appendFileSync(cfg.log, txt);
}
const NOTA_LAT = "¹ Latência = chegada no observador − `timestamp` do frame. Depende do relógio do notebook e do PC observador estarem sincronizados (NTP); em ensaio local é a mesma máquina.";

// ------------------------------------------------------------------ testes
async function testeA(cfg) {
    const c1 = conectar(cfg.url, cfg.token);
    const a1 = await Promise.race([c1.aberto, sleep(15000).then(() => ({ ok: false, code: "timeout" }))]);
    let ficou = false;
    if (a1.ok) { const f = await Promise.race([c1.fechado, sleep(3000).then(() => null)]); ficou = f === null; try { c1.ws.close(1000); } catch (e) {} }
    const errado = "token-errado-" + Math.random().toString(36).slice(2, 8);
    const c2 = conectar(cfg.url, errado);
    const f2 = await Promise.race([c2.fechado, sleep(15000).then(() => ({ code: "timeout" }))]);
    try { c2.ws.close(); } catch (e) {}
    const ok = a1.ok && ficou && f2.code === 4001;
    const corpo = ["| Passo | Esperado | Obtido |", "|---|---|---|",
        `| Conexão com token válido | abre e permanece aberta | ${a1.ok ? "abriu em " + a1.ms + " ms" : "não abriu (" + a1.code + ")"}${a1.ok ? (ficou ? ", aberta após 3 s" : ", FECHOU em seguida") : ""} |`,
        `| Conexão com token propositalmente errado | fechada com código 4001 | código ${f2.code} |`].join("\n");
    registrar(cfg, "Teste A — conectividade (wscat equivalente)", ok ? "PASS" : "FAIL", corpo);
    return ok;
}

async function coletar(cfg, segundos, extra = {}) {
    const obs = observador(cfg.url, cfg.token, extra);
    const inicio = Date.now();
    const passo = Math.max(10, Math.min(60, Math.round(segundos / 10)));
    for (let s = 0; s < segundos; s += passo) {
        await sleep(Math.min(passo, segundos - s) * 1000);
        const n = obs.frames.length;
        process.stderr.write(`  ${Math.min(s + passo, segundos)}/${segundos} s · ${n} frames · quedas do observador ${obs.quedas}\n`);
    }
    obs.fechar();
    return { obs, inicio, fim: Date.now() };
}

async function testeC(cfg, nome = "Teste C — consumo a cada 500 ms (console da SPA equivalente)") {
    const { obs, inicio, fim } = await coletar(cfg, cfg.duracao);
    const m = analisar(obs.frames, { janelaMs: cfg.janela, inicio, fim });
    const altaSust = latenciaSustentadaAlta(m.latencias_vivas);
    let res = "PASS";
    if (obs.erro4001) res = "FAIL";
    else if (m.unicos < 0.9 * m.esperado || m.lacunas_seq.length || m.lacunas_tempo.length) res = "FAIL";
    else if (m.intervalo_chegada_ms.p95 > 2 * cfg.janela || altaSust) res = "PASS WITH LIMITATION";
    const nota = [];
    if (obs.erro4001) nota.push("- Observador recebeu 4001: token de teste recusado.");
    if (altaSust) nota.push("- Latência p95 acima de 2 s por 5 minutos seguidos: abrir plano de mitigação (ping periódico do broker), seção 6.4.");
    if (m.intervalo_chegada_ms.p95 > 2 * cfg.janela) nota.push("- Chegadas irregulares (p95 > 1 s): a cadência na borda está correta se o passo entre timestamps for 500 ms; o atraso é de rede/broker.");
    registrar(cfg, nome, res, [tabelaMetricas(m), "", NOTA_LAT, ...nota].join("\n"));
    return res !== "FAIL";
}

async function testeB(cfg) {
    const { obs, inicio, fim } = await coletar(cfg, cfg.duracao);
    const b = obs.frames.filter(x => x.f.meta && x.f.meta.origem_dados === "TESTE_B");
    const u = b[b.length - 1];
    const chk = u ? {
        "meta.origem_dados = TESTE_B": true,
        "esteira.motorLigado = true (motorEsteira1)": u.f.esteira && u.f.esteira.motorLigado === true,
        "estacoes.estoque.magazine = 5 (posEstoque)": u.f.estacoes.estoque.magazine === 5,
        "estacoes.estoque.status = OPERANDO": u.f.estacoes.estoque.status === "OPERANDO",
        "nenhuma estação em EMERGENCIA (emergenciaEstoque = false)": Object.values(u.f.estacoes).every(e => e.status !== "EMERGENCIA")
    } : { "frames com meta.origem_dados = TESTE_B recebidos": false };
    const ok = Object.values(chk).every(Boolean);
    const corpo = ["Payload injetado no lugar do `s7 in`: `{statusEstoqueOk: true, emergenciaEstoque: false, motorEsteira1: true, posEstoque: 5}`", "",
        "| Verificação | OK? |", "|---|---|", ...Object.entries(chk).map(([k, v]) => `| ${k} | ${v ? "sim" : "NÃO"} |`), "",
        `Frames TESTE_B recebidos: ${b.length} de ${obs.frames.length} em ${Math.round((fim - inicio) / 1000)} s.`,
        u ? "\nÚltimo frame recebido:\n\n```json\n" + JSON.stringify(u.f, null, 2) + "\n```" : ""].join("\n");
    registrar(cfg, "Teste B — payload sintético no lugar do s7 in", ok ? "PASS" : "FAIL", corpo);
    return ok;
}

async function testeResiliencia(cfg) {
    console.error("\n>>> Observando por " + cfg.duracao + " s. Derrube o link da BANCADA (cabo ou Wi-Fi) por ~2 min e depois restaure.\n" +
                  ">>> Este observador deve rodar em OUTRA máquina/rede (ex.: celular roteado), para continuar conectado ao broker.\n");
    const { obs, inicio, fim } = await coletar(cfg, cfg.duracao);
    const m = analisar(obs.frames, { janelaMs: cfg.janela, inicio, fim });
    let res;
    if (m.buffered === 0) res = "BLOCKED";
    else if (m.lacunas_seq.length || m.lacunas_tempo.length) res = "FAIL";
    else res = "PASS";
    const corpo = [tabelaMetricas(m), "", NOTA_LAT, "",
        res === "BLOCKED" ? "- Nenhum frame com buffered=true: a queda não aconteceu ou não foi observada. Repita derrubando o link da bancada." :
        "- Critério: replay ordenado do Outbox, sem lacunas de seq/tempo; repetições de reenvio são descartadas por meta.msg_id (contadores não duplicam no consumidor).",
        `- Quedas do próprio observador: ${obs.quedas}.`].join("\n");
    registrar(cfg, "Teste de resiliência — queda e restauração do link", res, corpo);
    return res === "PASS";
}

async function testeComandos(cfg) {
    if (!cfg.confirmo) {
        console.error("Este teste envia START/STOP/RESET/EMERGENCY_STOP pelo broker. Se o Node-RED estiver em INPUT_MODE=CLP COM autorização\n" +
                      "de escrita, a bancada VAI se mover. Confirme que a área está segura e rode de novo com --confirmo-bancada-segura.");
        return false;
    }
    const acks = new Map();
    const obs = observador(cfg.url, cfg.token, { onMsg: (d) => { if (d && d.tipo === "ack" && d.id) acks.set(d.id, d); } });
    for (let i = 0; i < 50 && !(obs.atual && obs.atual.ws.readyState === 1); i++) await sleep(200);
    await sleep(1500);
    const fora = "unidade9-fora-da-lista";
    const casos = [
        { acao: "START", origem: cfg.origem, espera: "aceito pela whitelist" },
        { acao: "STOP", origem: cfg.origem, espera: "aceito pela whitelist" },
        { acao: "RESET", origem: cfg.origem, espera: "aceito pela whitelist" },
        ...["unidade1-grupo1", "unidade1-grupo2", "unidade1-grupo3", "unidade1-grupo4", "unidade1-grupo5"].map(o => ({ acao: "STOP", origem: o, espera: "aceito pela whitelist" })),
        { acao: "START", origem: fora, espera: "REJEITADO: origem não permitida" },
        { acao: "EMERGENCY_STOP", origem: fora, espera: "bypassa a whitelist (motivo ≠ origem)" },
        { acao: "RESET", origem: cfg.origem, espera: "aceito pela whitelist" },
    ];
    const linhas = []; let ok = true;
    for (const c of casos) {
        const id = "g1t-" + c.acao.toLowerCase() + "-" + Math.random().toString(36).slice(2, 7);
        obs.enviar({ acao: c.acao, origem: c.origem, id });
        let a = null; for (let i = 0; i < 40 && !a; i++) { await sleep(100); a = acks.get(id) || null; }
        let passou;
        if (!a) passou = false;
        else if (c.origem === fora && c.acao !== "EMERGENCY_STOP") passou = a.aceito === false && /origem/.test(a.motivo || "");
        else passou = !/origem/.test(a.motivo || "");          // passou pela whitelist (pode ser bloqueado pela autorização de escrita)
        ok = ok && passou;
        linhas.push(`| ${c.acao} | ${c.origem} | ${c.espera} | ${a ? (a.aceito ? "aceito" : "recusado") + " · destino " + (a.destino || "—") + (a.motivo ? " · " + a.motivo : "") : "SEM ACK em 4 s"} | ${passou ? "ok" : "FALHA"} |`);
        await sleep(cfg.acao_ms);
    }
    obs.fechar();
    const corpo = ["| Ação | Origem | Esperado | Ack recebido | Resultado |", "|---|---|---|---|---|", ...linhas, "",
        "- A rejeição de origem gera `node.warn` no Node-RED e linha REJEITADO em `GET /edge/comandos` (anexe o print).",
        "- Em INPUT_MODE=CLP sem autorização escrita, os acks vêm `recusado · escrita no CLP bloqueada`: comportamento esperado.",
        "- Escrita real no CLP (DB1,X0.4..X0.7) só com a autorização escrita anexada a esta evidência."].join("\n");
    registrar(cfg, "Canal de comandos — whitelist de origens e EMERGENCY_STOP", ok ? "PASS" : "FAIL", corpo);
    return ok;
}

function config(argv) {
    const op = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
    const tokenEnv = op("--token-env", "SMART40_TEST_TOKEN");
    return {
        teste: (argv[0] || "").toLowerCase(), url: op("--url", process.env.SMART40_BROKER_URL || ""),
        tokenEnv, token: process.env[tokenEnv] || "", duracao: Number(op("--duracao", 60)), janela: Number(op("--janela-ms", 500)),
        origem: op("--origem", "unidade1-grupo1"), acao_ms: Number(op("--intervalo-ms", 1500)),
        log: op("--log", LOG_PADRAO), semLog: argv.includes("--sem-log"), confirmo: argv.includes("--confirmo-bancada-segura")
    };
}

async function main(argv) {
    const cfg = config(argv);
    const testes = { a: testeA, b: testeB, c: testeC, resiliencia: testeResiliencia, comandos: testeComandos,
                     continuidade: (c) => testeC(c, "Continuidade — telemetria a cada 500 ms (Portão 3: 30 min)") };
    if (!testes[cfg.teste]) { console.error(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 22).join("\n")); return 2; }
    if (!cfg.url) { console.error("Defina SMART40_BROKER_URL (ou --url)"); return 2; }
    if (!/^wss:\/\//i.test(cfg.url)) { console.error("Só wss:// é permitido."); return 2; }
    if (cfg.url.includes("token=")) { console.error("Tire o token da URL; use a variável " + cfg.tokenEnv); return 2; }
    if (!cfg.token) { console.error("Defina a variável " + cfg.tokenEnv + " com o token de teste (não use o token do agente)."); return 2; }
    return (await testes[cfg.teste](cfg)) ? 0 : 1;
}

module.exports = { conectar, observador, analisar, latenciaSustentadaAlta, tabelaMetricas, registrar, versao, testeA, testeB, testeC, testeResiliencia, testeComandos, config, NOTA_LAT };
if (require.main === module) main(process.argv.slice(2)).then(c => process.exit(c), e => { console.error(e); process.exit(1); });
