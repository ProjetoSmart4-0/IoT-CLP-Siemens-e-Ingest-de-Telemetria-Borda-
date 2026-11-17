#!/usr/bin/env node
// =============================================================================
// Broker WSS LOCAL de ensaio — imita o comportamento descrito no roteiro da Sprint 3
// para o wss://smart40-broker.onrender.com, SEM substituí-lo na homologação:
//   - só wss:// (TLS com certificado autoassinado gerado na primeira execução);
//   - token na query (?token=...); token desconhecido -> conexão fechada com código 4001;
//   - toda mensagem recebida é repassada aos OUTROS clientes conectados (relay).
// Uso: cd tools && npm install && node mock-broker-smart40.js [--porta 8443] [--eco]
//   Tokens aceitos: variável MOCK_TOKENS (lista separada por vírgula).
//   Para o Node-RED/teste confiarem no certificado: NODE_EXTRA_CA_CERTS=tools/.mock-broker/cert.pem
// HIPÓTESE: o comportamento real do broker (relay, eco, formato de erro) deve ser confirmado com o G5.
// =============================================================================
const fs = require("fs"), path = require("path"), https = require("https");

function certificado(dir) {
    const cert = path.join(dir, "cert.pem"), key = path.join(dir, "key.pem");
    if (!fs.existsSync(cert) || !fs.existsSync(key)) {
        const selfsigned = require("selfsigned");
        const pems = selfsigned.generate([{ name: "commonName", value: "localhost" }], {
            days: 30, keySize: 2048, algorithm: "sha256",
            extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }]
        });
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(cert, pems.cert); fs.writeFileSync(key, pems.private);
    }
    return { cert, key };
}

function iniciar(opts = {}) {
    const { WebSocketServer } = require("ws");
    const porta = Number(opts.porta || 8443);
    const dir = opts.certDir || path.join(__dirname, ".mock-broker");
    const tokens = new Set(String(opts.tokens || process.env.MOCK_TOKENS || "agente-local,observador-local,grupo4-local").split(",").map(s => s.trim()).filter(Boolean));
    const { cert, key } = certificado(dir);
    const server = https.createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) });
    const wss = new WebSocketServer({ server });
    const stats = { conexoes: 0, recusadas_4001: 0, mensagens: 0 };
    const log = opts.silencioso ? () => {} : (...a) => console.log(new Date().toISOString(), ...a);
    wss.on("connection", (sock, req) => {
        const tok = new URL(req.url, "https://localhost").searchParams.get("token") || "";
        if (!tokens.has(tok)) { stats.recusadas_4001++; log("token recusado -> 4001"); sock.close(4001, "token invalido"); return; }
        stats.conexoes++; sock._token = tok; log("conectado:", tok.replace(/.(?=.{3})/g, "*"));
        sock.on("message", (data) => {
            stats.mensagens++;
            const txt = data.toString();
            for (const c of wss.clients) {
                if (c.readyState !== 1) continue;
                if (c === sock && !opts.eco) continue;
                c.send(txt);
            }
        });
        sock.on("close", () => log("desconectado:", tok.replace(/.(?=.{3})/g, "*")));
    });
    return new Promise((ok, erro) => {
        server.once("error", erro);
        server.listen(porta, "127.0.0.1", () => {
            log("broker de ensaio em wss://localhost:" + porta + " (CA: " + cert + ")");
            ok({ url: "wss://localhost:" + porta, caFile: cert, stats,
                 fechar: () => new Promise(r => { for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); }) });
        });
    });
}
module.exports = { iniciar, certificado };

if (require.main === module) {
    const a = process.argv.slice(2);
    const porta = a.includes("--porta") ? a[a.indexOf("--porta") + 1] : 8443;
    iniciar({ porta, eco: a.includes("--eco") }).catch(e => { console.error(e.message); process.exit(1); });
}
