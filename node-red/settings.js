// settings.js do gateway de borda do Grupo 1 (Sprints 1, 2 e 3).
// Uso no notebook (sem Docker): copie para ~/.node-red/settings.js (faça backup do original).
// Docker: já é montado em /data/settings.js pelo docker-compose.yml.
// NADA de segredo neste arquivo: token, URL com token e senhas vêm de variáveis de ambiente.
const path = require("path");

// Outbox SQLite (Sprints 2 e 3) usa o módulo nativo node:sqlite -> Node.js >= 22.13.
// Se não existir, o Node-RED sobe normalmente e os nós da outbox avisam em vermelho.
let sqlite = null;
try {
    process.removeAllListeners("warning");      // esconde o aviso "ExperimentalWarning: SQLite"
    sqlite = require("node:sqlite");
} catch (e) {
    console.warn("[grupo1] node:sqlite indisponível (" + process.version + "). Use Node.js 22.13+ para a outbox.");
}

// Sprint 3 — ponte borda-nuvem. Regras do roteiro checadas ANTES de o Node-RED subir:
// só wss://, nunca a Vercel, token fora da URL (vai em SMART40_AGENT_TOKEN).
const BROKER = (process.env.SMART40_BROKER_URL || "").trim();
if (BROKER) {
    if (!/^wss:\/\//i.test(BROKER)) { throw new Error("[grupo1] SMART40_BROKER_URL deve começar com wss:// (ws:// é proibido)"); }
    if (/vercel\.(app|com)/i.test(BROKER)) { throw new Error("[grupo1] a ponte WSS nunca aponta para a Vercel"); }
    if (/[?&]token=/i.test(BROKER)) { throw new Error("[grupo1] tire o token da URL: use a variável SMART40_AGENT_TOKEN"); }
} else {
    console.warn("[grupo1] SMART40_BROKER_URL não definida: a ponte WSS (Sprint 3) fica desligada.");
}
if (typeof globalThis.WebSocket !== "function") {
    console.warn("[grupo1] WebSocket nativo indisponível (" + process.version + "). Use Node.js 22.13+ para a ponte WSS.");
}

module.exports = {
    flowFile: "flows.json",
    uiPort: process.env.PORT || 1880,
    // Chave que criptografa flows_cred.json (usuário/senha do HiveMQ). Defina NODE_RED_CREDENTIAL_SECRET
    // no ambiente. Sem ela, o Node-RED gera uma chave própria no .config.runtime.json (fora do Git).
    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || undefined,

    // Sprint 1: o buffer offline do fluxo antigo usa o store "file" (sobrevive a reinício).
    contextStorage: {
        default: { module: "memory" },
        file:    { module: "localfilesystem", config: { flushInterval: 5 } }
    },

    // Objetos disponíveis nos nós function via global.get(...)
    functionGlobalContext: {
        sqlite: sqlite,
        WebSocket: globalThis.WebSocket,                                    // Sprint 3: cliente da ponte WSS
        outboxPath:  process.env.OUTBOX_PATH  || path.join(__dirname, "outbox_n2.sqlite"),
        pontePath:   process.env.PONTE_OUTBOX_PATH || path.join(__dirname, "outbox_ponte_wss.sqlite"),
        captureFile: process.env.CAPTURE_FILE || path.join(__dirname, "captures", "captura-n2.jsonl")
    },

    // Recomendado antes de levar para a bancada: proteger o editor com senha.
    // Gere o hash com:  node-red admin hash-pw
    // adminAuth: { type: "credentials", users: [{ username: "grupo1", password: "HASH_AQUI", permissions: "*" }] },

    logging: { console: { level: "info", metrics: false, audit: false } },
    functionExternalModules: false
};
