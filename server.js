const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const db = require('./database');
const path = require('path');
const session = require('express-session'); // Asigură-te că ai 'express-session' instalat

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Stocăm boții activi în memorie (RAM)
const activeBots = {}; 

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Configurare sesiune (simplificată pentru exemplu)
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// --- API ROUTES ---

// 1. Obține toți boții salvați
app.get('/api/bots', (req, res) => {
    db.all("SELECT * FROM bots", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        // Adăugăm statusul online/offline
        const botsWithStatus = rows.map(bot => ({
            ...bot,
            isOnline: !!activeBots[bot.id]
        }));
        res.json(botsWithStatus);
    });
});

// 2. Adaugă Bot Nou
app.post('/api/bots', (req, res) => {
    const { nickname, server_ip, version, proxy, auto_msg } = req.body;
    db.run(`INSERT INTO bots (nickname, server_ip, version, proxy, auto_msg) VALUES (?,?,?,?,?)`,
        [nickname, server_ip, version, proxy, auto_msg],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, success: true });
        }
    );
});

// 3. PORNEȘTE UN BOT (Conectare la server MC)
app.post('/api/bots/start', (req, res) => {
    const { id } = req.body;
    
    db.get("SELECT * FROM bots WHERE id = ?", [id], (err, botData) => {
        if (!botData) return res.status(404).json({ error: "Bot not found" });
        if (activeBots[id]) return res.json({ message: "Bot already running" });

        console.log(`Pornire bot: ${botData.nickname} pe ${botData.server_ip}...`);

        // Configurare Mineflayer
        const botOptions = {
            host: botData.server_ip,
            username: botData.nickname,
            version: botData.version || false, // Auto-detect dacă e gol
            // skipValidation: true // Pentru servere cracked/offline
        };

        const bot = mineflayer.createBot(botOptions);

        // Event: Bot a intrat pe server
        bot.on('spawn', () => {
            activeBots[id] = bot;
            io.emit('bot-status', { id: id, status: 'online' });
            
            if (botData.auto_msg) {
                setTimeout(() => { bot.chat(botData.auto_msg); }, 3000);
            }
        });

        // Event: Chat logs
        bot.on('chat', (username, message) => {
            io.emit('bot-log', { id: id, msg: `[${username}]: ${message}` });
        });
        
        // Event: Kicked/Error
        bot.on('end', () => {
            delete activeBots[id];
            io.emit('bot-status', { id: id, status: 'offline' });
            io.emit('bot-log', { id: id, msg: "--- BOT DISCONNECTED ---" });
        });

        bot.on('error', (err) => {
            io.emit('bot-log', { id: id, msg: `Eroare: ${err.message}` });
        });

        activeBots[id] = bot; // Salvăm referința chiar înainte de spawn pentru gestionare
        res.json({ success: true });
    });
});

// 4. OPRIRE BOT
app.post('/api/bots/stop', (req, res) => {
    const { id } = req.body;
    if (activeBots[id]) {
        activeBots[id].quit();
        delete activeBots[id];
        io.emit('bot-status', { id: id, status: 'offline' });
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Bot is not running" });
    }
});

// --- SOCKET.IO PENTRU CHAT LIVE ---
io.on('connection', (socket) => {
    console.log('User connected to dashboard');
    
    // Primim comandă de la UI să trimitem mesaj în joc
    socket.on('send-command', ({ botId, command }) => {
        const bot = activeBots[botId];
        if (bot) {
            bot.chat(command);
            io.emit('bot-log', { id: botId, msg: `> (Tu): ${command}` });
        }
    });
});

server.listen(3000, () => {
    console.log('MC Bot Manager running on http://localhost:3000');
});
