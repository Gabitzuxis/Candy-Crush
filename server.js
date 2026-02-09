const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs'); // Folosim versiunea sigura
const path = require('path');
const mineflayer = require('mineflayer');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configurare Port pentru Render
const PORT = process.env.PORT || 3000;

// Stocăm boții activi în memoria RAM
const activeBots = {}; 

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'secret-key-super-secure',
    resave: false,
    saveUninitialized: true
}));

// --- RUTE DE BAZĂ ---

// Redirect automat către Login
app.get('/', (req, res) => {
    if (req.session.userId) {
        res.redirect('/dashboard.html');
    } else {
        res.redirect('/login.html');
    }
});

// --- API: AUTH (LOGIN & REGISTER) ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err || !user) return res.json({ success: false, message: "User inexistent." });
        
        if (bcrypt.compareSync(password, user.password)) {
            req.session.userId = user.id;
            req.session.username = user.username;
            res.json({ success: true });
        } else {
            res.json({ success: false, message: "Parolă greșită." });
        }
    });
});

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const hash = bcrypt.hashSync(password, 8);
    db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash], function(err) {
        if (err) return res.json({ success: false, message: "Userul există deja." });
        res.json({ success: true });
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login.html');
});

// --- API: BOȚI (AICI ESTE PARTEA CARE ÎȚI LIPSEA!) ---

// 1. Obține lista de boți salvați
app.get('/api/bots', (req, res) => {
    if (!req.session.userId) return res.status(403).json({ error: "Neautorizat" });

    db.all("SELECT * FROM bots", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Adăugăm statusul online/offline pentru fiecare bot
        const botsWithStatus = rows.map(bot => ({
            ...bot,
            isOnline: !!activeBots[bot.id] // Verifică dacă e în memoria RAM
        }));
        res.json(botsWithStatus);
    });
});

// 2. Salvează un Bot NOU
app.post('/api/bots', (req, res) => {
    if (!req.session.userId) return res.status(403).json({ error: "Neautorizat" });

    const { nickname, server_ip, version, proxy, auto_msg } = req.body;
    console.log(`[DB] Se salvează botul: ${nickname}`);

    const sql = `INSERT INTO bots (nickname, server_ip, version, proxy, auto_msg) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [nickname, server_ip, version, proxy, auto_msg], function(err) {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: "Eroare la salvare." });
        }
        res.json({ success: true, id: this.lastID });
    });
});

// 3. START BOT (Pornire Mineflayer)
app.post('/api/bots/start', (req, res) => {
    const { id } = req.body;
    if (activeBots[id]) return res.json({ success: false, message: "Botul rulează deja!" });

    db.get("SELECT * FROM bots WHERE id = ?", [id], (err, botData) => {
        if (!botData) return res.status(404).json({ error: "Bot not found" });

        console.log(`[SYSTEM] Pornire bot: ${botData.nickname}...`);

        const botOptions = {
            host: botData.server_ip,
            username: botData.nickname,
            version: botData.version || false
        };

        // Creăm botul
        try {
            const bot = mineflayer.createBot(botOptions);

            // Evenimente Mineflayer
            bot.on('spawn', () => {
                activeBots[id] = bot; // Îl salvăm ca activ
                io.emit('bot-status', { id: id, status: 'online' });
                io.emit('bot-log', { id: id, msg: `✅ Conectat la ${botData.server_ip}` });
                
                if (botData.auto_msg) {
                    setTimeout(() => bot.chat(botData.auto_msg), 2000);
                }
            });

            bot.on('chat', (username, message) => {
                io.emit('bot-log', { id: id, msg: `[${username}]: ${message}` });
            });

            bot.on('end', () => {
                delete activeBots[id];
                io.emit('bot-status', { id: id, status: 'offline' });
                io.emit('bot-log', { id: id, msg: "❌ Deconectat." });
            });

            bot.on('error', (err) => {
                io.emit('bot-log', { id: id, msg: `⚠️ Eroare: ${err.message}` });
            });

            // Îl marcăm ca activ temporar (până la spawn)
            activeBots[id] = bot; 
            res.json({ success: true });

        } catch (e) {
            res.json({ success: false, message: e.message });
        }
    });
});

// 4. STOP BOT
app.post('/api/bots/stop', (req, res) => {
    const { id } = req.body;
    if (activeBots[id]) {
        activeBots[id].quit();
        delete activeBots[id];
        io.emit('bot-status', { id: id, status: 'offline' });
        res.json({ success: true });
    } else {
        res.json({ success: false, message: "Botul nu este pornit." });
    }
});

// --- SOCKET.IO (COMENZI LIVE) ---
io.on('connection', (socket) => {
    socket.on('send-command', ({ botId, command }) => {
        const bot = activeBots[botId];
        if (bot) {
            bot.chat(command);
            io.emit('bot-log', { id: botId, msg: `> (Tu): ${command}` });
        }
    });
});

// Pornire Server
server.listen(PORT, () => {
    console.log(`MC Manager running on port ${PORT}`);
});
