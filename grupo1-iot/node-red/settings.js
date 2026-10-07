// settings.js mínimo para o gateway de borda do Grupo 1.
// Uso no notebook (sem Docker): copie para ~/.node-red/settings.js (faça backup do original)
// ou só acrescente o bloco "contextStorage" ao seu settings.js existente.
module.exports = {
    flowFile: "flows.json",
    uiPort: process.env.PORT || 1880,
    // Chave para criptografar as credenciais (usuário/senha do HiveMQ) em flows_cred.json
    credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET || "troque-esta-chave-grupo1",

    // ESSENCIAL para o Store-and-Forward: o buffer offline usa o store "file",
    // que grava em disco e sobrevive a reinício do Node-RED / queda de energia.
    contextStorage: {
        default: { module: "memory" },
        file:    { module: "localfilesystem", config: { flushInterval: 5 } }
    },

    // Recomendado antes de levar para a bancada: proteger o editor com senha.
    // Gere o hash com:  node-red admin hash-pw
    // adminAuth: { type: "credentials", users: [{ username: "grupo1", password: "HASH_AQUI", permissions: "*" }] },

    logging: { console: { level: "info", metrics: false, audit: false } },
    functionExternalModules: false
};
