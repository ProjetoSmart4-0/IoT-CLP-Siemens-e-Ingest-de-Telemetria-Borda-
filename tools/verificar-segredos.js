#!/usr/bin/env node
// =============================================================================
// Verificação de segredos — critério da Sprint 3: "Nenhum segredo no repositório
// (verificação de histórico do Git incluída)".
//   node tools/verificar-segredos.js              arquivos atuais
//   node tools/verificar-segredos.js --historico  arquivos atuais + todo o histórico (git log -p --all)
// Saída 0 = nada encontrado. Para uma varredura mais completa use também o gitleaks
// (https://github.com/gitleaks/gitleaks):  gitleaks detect --source . -v
// =============================================================================
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const IGNORAR_DIR = new Set([".git", "node_modules", ".venv", "__pycache__", ".pytest_cache", ".mock-broker"]);
const BINARIO = /\.(png|jpe?g|gif|xlsx|pdf|zip|sqlite|ico|woff2?)$/i;
const PLACEHOLDER = /(SEU|SUA|TROQUE|troque|EXEMPLO|exemplo|xxxxx|USUARIO|SENHA\b|COLOQUE|<[^>]+>|^<|\$\{|HASH_AQUI|token-teste|agente-local|observador-local|grupo4-local|token-errado|\.\.\.)/;
// Valores que são código, referência ao Secret Manager ou nome de variável — não são segredo.
const CODIGO = /^(process\.|env\.|os\.|String\(|Number\(|getenv|environ|\/|\(|\[|\{|[a-z_]+\(|[\w-]+:latest$)/;
// Em testes automatizados os valores são fictícios: só as regras fortes valem lá.
const EH_TESTE = (origem) => /(^|[\/\\])tests?[\/\\]|\.test\.js$|test_[\w]+\.py$/.test(origem);

const REGRAS = [
    { nome: "token na URL do broker", re: /wss?:\/\/[^\s"'`]*[?&]token=([^\s"'`&)]+)/gi, grupo: 1 },
    { nome: "URL de banco com senha", re: /postgres(?:ql)?:\/\/[^:\s"'`]+:([^@\s"'`]+)@/gi, grupo: 1 },
    { nome: "chave privada", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
    { nome: "JWT", re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
    { nome: "atribuição de segredo", re: /\b(?:password|passwd|senha|secret|api[_-]?key|token|JWT_SECRET|INGEST_API_KEY|MQTT_PASSWORD|SMART40_AGENT_TOKEN|SMART40_TEST_TOKEN|NODE_RED_CREDENTIAL_SECRET|POSTGRES_PASSWORD)\s*[:=]\s*["']?([^\s"',;)}]{6,})/gi, grupo: 1 },
];
// O token de agente/teste do roteiro (unidade1-agente) e os tokens unidade1-grupoN são credenciais do broker:
// os nomes unidade1-grupo1..5 podem aparecer como ORIGENS na whitelist (exigência do roteiro), nunca como token.
const TOKENS_CONHECIDOS = /token=unidade1-(?:agente|grupo\d)/i; // verificar-segredos: ignorar

function arquivos(dir) {
    let out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORAR_DIR.has(e.name)) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out = out.concat(arquivos(p));
        else if (!BINARIO.test(e.name) && fs.statSync(p).size < 5e6) out.push(p);
    }
    return out;
}
function varrer(texto, origem, achados, arquivo) {
    if (arquivo && (BINARIO.test(arquivo) || /(^|\/)node_modules\//.test(arquivo))) return;
    const linhas = texto.split("\n");
    linhas.forEach((l, i) => {
        if (/verificar-segredos: ignorar/.test(l)) return;
        if (TOKENS_CONHECIDOS.test(l)) achados.push({ origem, linha: i + 1, regra: "token do broker (unidade1-*)", trecho: l.trim().slice(0, 140) });
        for (const r of REGRAS) {
            r.re.lastIndex = 0; let m;
            while ((m = r.re.exec(l))) {
                const valor = r.grupo ? m[r.grupo] : m[0];
                if (r.grupo && (PLACEHOLDER.test(valor) || CODIGO.test(valor) || /^(null|undefined|true|false|""|''|str|string|Optional)$/.test(valor))) continue;
                if (r.nome === "atribuição de segredo" && EH_TESTE(arquivo || origem)) continue;
                if (r.nome === "atribuição de segredo" && /^[A-Z_]+$/.test(valor)) continue;          // nome de variável, não valor
                achados.push({ origem, linha: i + 1, regra: r.nome, trecho: l.trim().slice(0, 140) });
            }
        }
    });
}

const achados = [];
for (const f of arquivos(ROOT)) { const rel = path.relative(ROOT, f); varrer(fs.readFileSync(f, "utf8"), rel, achados, rel); }
let historico = "não verificado (use --historico)";
if (process.argv.includes("--historico")) {
    try {
        const log = execSync("git log -p --all --no-color --format=commit:%h", { cwd: ROOT, maxBuffer: 1 << 30 }).toString();
        const antes = achados.length;
        let commit = "?", arq = "?", bloco = [];
        const fecha = () => { if (bloco.length) varrer(bloco.join("\n"), `histórico ${commit}:${arq}`, achados, arq); bloco = []; };
        for (const l of log.split("\n")) {
            if (l.startsWith("commit:")) { fecha(); commit = l.slice(7); }
            else if (l.startsWith("+++ ")) { fecha(); arq = l.replace(/^\+\+\+ (b\/)?/, ""); }
            else if (l.startsWith("+")) bloco.push(l.slice(1));
        }
        fecha();
        historico = "verificado: " + (achados.length - antes) + " ocorrência(s)";
    } catch (e) { historico = "falhou (" + e.message.split("\n")[0] + ")"; }
}
for (const a of achados) console.log(`[${a.regra}] ${a.origem}:${a.linha}  ${a.trecho}`);
console.log(`\n${achados.length} ocorrência(s) em arquivos atuais${process.argv.includes("--historico") ? " + histórico" : ""}. Histórico do Git: ${historico}.`);
console.log(achados.length ? "RESULTADO: FAIL — remova o segredo, troque a credencial (ela vazou) e reescreva o histórico se estiver em commits." : "RESULTADO: PASS — nenhum segredo encontrado.");
process.exit(achados.length ? 1 : 0);
