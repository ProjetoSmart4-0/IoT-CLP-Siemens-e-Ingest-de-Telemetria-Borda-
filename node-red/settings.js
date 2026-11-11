// settings.js do gateway de borda do Grupo 1 (Sprint 1 + Sprint 2).
// Uso no notebook (sem Docker): copie para ~/.node-red/settings.js (faça backup do original).
// Docker: já é montado em /data/settings.js pelo docker-compose.yml.
const path = require("path");

// Outbox SQLite (Sprint 2) usa o módulo nativo node:sqlite -> Node.js >= 22.13.
// Se não existir, o Node-RED sobe normalmente e o nó da outbox avisa em vermelho.
let sqlite = null;
try {
    process.removeAllListeners("warning");      // esconde o aviso "ExperimentalWarning: SQLite"
    sqlite = require("node:sqlite");
} catch (e) {
    console.warn("[grupo1] node:sqlite indisponível (" + process.version + "). Use Node.js 22.13+ para a outbox.");
}

module.exports = {
    flowFile: "flows.json",
    uiPort: process.env.PORT || 1880,
    // Chave para criptografar as credenciais (usuário/senha do HiveMQ) em flows_cred.json
    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || "troque-esta-chave-grupo1",

    // Sprint 1: o buffer offline do fluxo antigo usa o store "file" (sobrevive a reinício).
    contextStorage: {
        default: { module: "memory" },
        file:    { module: "localfilesystem", config: { flushInterval: 5 } }
    },

    // Sprint 2: objetos disponíveis nos nós function via global.get(...)
    functionGlobalContext: {
        sqlite: sqlite,
        outboxPath:  process.env.OUTBOX_PATH  || path.join(__dirname, "outbox_n2.sqlite"),
        captureFile: process.env.CAPTURE_FILE || path.join(__dirname, "captures", "captura-n2.jsonl")
    },

    // Recomendado antes de levar para a bancada: proteger o editor com senha.
    // Gere o hash com:  node-red admin hash-pw
    // adminAuth: { type: "credentials", users: [{ username: "grupo1", password: "HASH_AQUI", permissions: "*" }] },

    logging: { console: { level: "info", metrics: false, audit: false } },
    functionExternalModules: false
};
