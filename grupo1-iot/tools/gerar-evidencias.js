#!/usr/bin/env node
// =============================================================================
// Gera a evidência automática do Grupo 1 (runbook Sprint 1, "Definition of Done").
// Rodar na RAIZ do repositório:   node tools/gerar-evidencias.js
// Saída: docs/evidence/sprint1/G1-auto-AAAA-MM-DD.md   (sem segredos)
//
// O que verifica:
//   1. Versões: Node.js, npm, Node-RED, driver node-red-contrib-s7, Python, commit Git
//   2. Testes: lógica de borda (Node) e iot-service (pytest)
//   3. Segurança dos fluxos: nenhum nó "s7 out" (somente leitura) e nenhuma credencial exportada
//   4. Segredos no Git: nenhum arquivo .env versionado, nenhum padrão óbvio de senha/chave
// =============================================================================
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "evidence", "sprint1");
const today = new Date().toISOString().slice(0, 10);
const results = [];

function run(cmd, opts = {}) {
    const r = spawnSync(cmd, { shell: true, encoding: "utf8", cwd: opts.cwd || ROOT, timeout: opts.timeout || 120000 });
    return { code: r.status, out: ((r.stdout || "") + (r.stderr || "")).trim() };
}
function first(cmds, opts) {            // primeiro comando que funcionar
    for (const c of cmds) { const r = run(c, opts); if (r.code === 0 && r.out) return { cmd: c, ...r }; }
    return null;
}
function record(id, item, status, detail) { results.push({ id, item, status, detail }); }
function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; } }

// ---------------------------------------------------------------- 1. versões
const userDir = path.join(os.homedir(), ".node-red");
const nr = first(["node-red --version", "npx --no-install node-red --version"]);
const nrPkg = readJSON(path.join(userDir, "node_modules", "node-red", "package.json"));
const s7Pkg = readJSON(path.join(userDir, "node_modules", "node-red-contrib-s7", "package.json"));
const py = first(["python --version", "python3 --version", "py --version"]);
const git = run("git rev-parse --short HEAD");
const versions = {
    "Sistema operacional": `${os.type()} ${os.release()} (${os.arch()})`,
    "Node.js": process.version,
    "npm": (run("npm --version").out || "não encontrado").split("\n")[0],
    "Node-RED": nr ? (nr.out.match(/v?\d+\.\d+\.\d+/) || [nr.out])[0] : (nrPkg ? nrPkg.version : "NÃO ENCONTRADO"),
    "node-red-contrib-s7": s7Pkg ? s7Pkg.version : "NÃO ENCONTRADO em ~/.node-red/node_modules",
    "Python": py ? py.out.replace("Python ", "") : "não encontrado",
    "Commit do repositório": git.code === 0 ? git.out : "fora de um repositório Git",
};
const envOk = versions["Node-RED"] !== "NÃO ENCONTRADO" && s7Pkg;
record("G1-01", "Ambiente local: Node-RED + driver S7 instalados", envOk ? "PASS" : "FAIL",
    envOk ? `Node-RED ${versions["Node-RED"]}, node-red-contrib-s7 ${versions["node-red-contrib-s7"]}`
          : "Node-RED ou o driver S7 não foi encontrado em ~/.node-red (instale pelo Manage palette)");

// ---------------------------------------------------------------- 2. testes
const edge = run("node node-red/tests/edge-logic.test.js");
record("G1-06a", "Testes da lógica de borda (simulador, JSON, buffer offline)", edge.code === 0 ? "PASS" : "FAIL",
    edge.code === 0 ? "todos os testes passaram" : edge.out.split("\n").slice(-3).join(" | "));

const pyCmd = py ? py.cmd.split(" ")[0] : null;
let pytest = null;
if (pyCmd) {
    // Usa o Python da .venv do iot-service, se existir
    const venvPy = [path.join(ROOT, "iot-service", ".venv", "Scripts", "python.exe"),
                    path.join(ROOT, "iot-service", ".venv", "bin", "python")].find(p => fs.existsSync(p));
    pytest = run(`"${venvPy || pyCmd}" -m pytest -q`, { cwd: path.join(ROOT, "iot-service") });
}
const pyLast = pytest ? (pytest.out.split("\n").filter(Boolean).pop() || "") : "";
record("G1-06b", "Testes do iot-service (API, RBAC 401/403, deduplicação)",
    pytest && pytest.code === 0 ? "PASS" : "FAIL",
    pytest ? pyLast : "Python não encontrado");

// ---------------------------------------------------------------- 3. fluxos somente leitura
const flowDir = path.join(ROOT, "node-red");
const flowFiles = fs.readdirSync(flowDir).filter(f => f.endsWith(".json"));
const flowProblems = [];
for (const f of flowFiles) {
    const nodes = readJSON(path.join(flowDir, f));
    if (!Array.isArray(nodes)) { if (nodes !== null) continue; flowProblems.push(`${f}: JSON inválido`); continue; }
    const writes = nodes.filter(n => n.type === "s7 out" || n.type === "s7 control");
    if (writes.length) flowProblems.push(`${f}: ${writes.length} nó(s) de escrita/controle S7`);
    const creds = nodes.filter(n => n.credentials && Object.values(n.credentials).some(v => v));
    if (creds.length) flowProblems.push(`${f}: credenciais exportadas em ${creds.length} nó(s)`);
}
record("G1-05", "Fluxos somente leitura e sem credenciais", flowProblems.length ? "FAIL" : "PASS",
    flowProblems.length ? flowProblems.join("; ") : `${flowFiles.filter(f => Array.isArray(readJSON(path.join(flowDir, f)))).length} fluxo(s) verificados: 0 nós s7 out, 0 credenciais`);

// ---------------------------------------------------------------- 4. segredos no Git
const secretProblems = [];
const tracked = run("git ls-files");
if (tracked.code === 0) {
    const files = tracked.out.split("\n").filter(Boolean);
    files.filter(f => /(^|\/)\.env$/.test(f)).forEach(f => secretProblems.push(`arquivo versionado: ${f}`));
    const patterns = [
        [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "chave privada"],
        [/postgres(?:ql)?:\/\/[^:\s"']+:(?!SENHA|senha_segura_40|SenhaSecreta)[^@\s"']{6,}@[^\s"']*neon\.tech/, "URL do Neon com senha"],
        [/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}/, "token JWT"],
    ];
    for (const f of files) {
        if (/\.(png|jpg|jpeg|gif|zip|pdf)$/i.test(f) || f.includes("node_modules")) continue;
        let txt; try { txt = fs.readFileSync(path.join(ROOT, f), "utf8"); } catch (e) { continue; }
        for (const [re, label] of patterns) if (re.test(txt)) secretProblems.push(`${label} em ${f}`);
    }
    record("G1-08", "Nenhum segredo versionado no Git", secretProblems.length ? "FAIL" : "PASS",
        secretProblems.length ? secretProblems.join("; ") : `${files.length} arquivos versionados verificados`);
} else {
    record("G1-08", "Nenhum segredo versionado no Git", "BLOCKED", "pasta não é um repositório Git");
}

// ---------------------------------------------------------------- itens manuais (bancada)
record("G1-02", "Conectividade TCP/102 até o CLP", "BLOCKED", "preencher após teste na bancada (ver G1-bloqueio-hardware.md)");
record("G1-03", "Leitura S7 comparada com a watch table do TIA", "BLOCKED", "preencher após teste na bancada");
record("G1-04", "Tabela de tags confirmada pelo responsável da automação", "BLOCKED", "docs/tags/tabela-tags-grupo1.csv aguardando confirmação");

// ---------------------------------------------------------------- relatório
results.sort((a, b) => a.id.localeCompare(b.id));
const icon = { PASS: "✅", FAIL: "❌", BLOCKED: "⛔", "PASS WITH LIMITATION": "⚠️" };
let md = `# Evidência automática — Grupo 1 — ${today}\n\n`;
md += `Gerado por \`node tools/gerar-evidencias.js\`. Não contém segredos. Itens BLOCKED dependem da bancada.\n\n`;
md += `## Versões do ambiente\n\n| Componente | Versão |\n|---|---|\n`;
for (const [k, v] of Object.entries(versions)) md += `| ${k} | ${v} |\n`;
md += `\n## Resultados\n\n| ID | Item | Status | Detalhe |\n|---|---|---|---|\n`;
for (const r of results) md += `| ${r.id} | ${r.item} | ${icon[r.status] || ""} ${r.status} | ${String(r.detail).replace(/\|/g, "/")} |\n`;
fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, `G1-auto-${today}.md`);
fs.writeFileSync(outFile, md, "utf8");

console.log(md);
console.log(`Arquivo gerado: ${path.relative(ROOT, outFile)}`);
process.exit(results.some(r => r.status === "FAIL") ? 1 : 0);
