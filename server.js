// server.js
// Ponto de entrada da aplicação: sobe um servidor HTTP (Express) que serve
// o front-end estático e um servidor de WebSocket (Socket.IO) que cuida
// de toda a comunicação em tempo real do jogo.

const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { registerSocketHandlers } = require('./src/socketHandlers');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // protótipo: liberado para facilitar testes em rede local
  },
});

// Serve os arquivos estáticos do front-end (HTML/CSS/JS puro, sem build).
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

io.on('connection', (socket) => {
  registerSocketHandlers(io, socket);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🃏  Palpite Geral rodando em http://localhost:${PORT}`);
  console.log(`   Para testar em outro dispositivo na mesma rede, use o IP local da máquina.\n`);
});

// Exportado só para permitir testes de integração no mesmo processo
// (ver test/integration-v2-test.js). Não afeta o comportamento normal do
// servidor rodando via `node server.js` / `npm start`.
module.exports = { app, server, io };
