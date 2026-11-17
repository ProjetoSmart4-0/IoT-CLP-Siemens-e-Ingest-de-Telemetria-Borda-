#!/usr/bin/env node
// =============================================================================
// Gera packages/agente-local/node-red/ (entregável 13 da Sprint 3) a partir das fontes:
//   flows.json   <- node-red/flow_ingestao_n2.json (export consolidado das 3 abas)
//   settings.js  <- node-red/settings.js
//   package.json (dependências a reinstalar depois do import)
// e confere que o export não leva credencial nenhuma.
// Rodar sempre que o fluxo mudar:  node tools/exportar-agente-local.js
// Na bancada, o export manual equivalente é: Ctrl+A → Menu → Export → All flows → Download.
// =============================================================================
const fs = require("fs"), path = require("path"), assert = require("assert");
const ROOT = path.join(__dirname, "..");
const DEST = path.join(ROOT, "packages", "agente-local", "node-red");
fs.mkdirSync(DEST, { recursive: true });

const flow = JSON.parse(fs.readFileSync(path.join(ROOT, "node-red", "flow_ingestao_n2.json"), "utf8"));
// Sem credenciais: o export do Node-RED não inclui senhas (ficam em flows_cred.json, fora do Git).
for (const n of flow) {
    assert.ok(!n.credentials, "nó com credentials no export: " + n.id);
    const txt = JSON.stringify(n);
    assert.ok(!/[?&]token=[^"\\s]/.test(txt.replace(/\[\?&\]token=/g, "")), "token em URL no nó " + n.id);
    if (n.type === "tls-config") assert.ok(!n.cert && !n.key, "certificado embutido no nó TLS");
    if (n.type === "mqtt-broker") assert.ok(!/\.hivemq\.cloud$/.test(n.broker) || /SEU-CLUSTER/.test(n.broker), "cluster real do HiveMQ no export");
}
fs.writeFileSync(path.join(DEST, "flows.json"), JSON.stringify(flow, null, 4) + "\n");
fs.copyFileSync(path.join(ROOT, "node-red", "settings.js"), path.join(DEST, "settings.js"));
fs.writeFileSync(path.join(DEST, "package.json"), JSON.stringify({
    name: "agente-local-grupo1", private: true,
    description: "Dependências do Node-RED da bancada (reinstalar depois de importar o flows.json). Node.js >= 22.13.",
    dependencies: { "node-red-contrib-s7": "3.1.3" }
}, null, 2) + "\n");
console.log("packages/agente-local/node-red atualizado: flows.json (" + flow.length + " nós), settings.js, package.json");
