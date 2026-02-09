const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs'); // AM SCHIMBAT AICI
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurare Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'secret-key-super-secure',
    resave: false,
    saveUninitialized: true
}));

// DEBUG: Vedem dacă baza de date e accesibilă la pornire
console.log("--- SERVER STARTING ---");
db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, row) => {
    if (err) console.error("!!! EROARE INIT DB:", err);
    else console.log("Verificare DB: Tabela 'users' există/este accesibilă.");
});

// Ruta LOGIN cu Log-uri Detaliate
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log(`[LOGIN ATTEMPT] User: ${username}`);

    const sql = 'SELECT * FROM users WHERE username = ?';
    db.get(sql, [username], (err, user) => {
        if (err) {
            console.error("[LOGIN DB ERROR]:", err.message);
            return res.status(500).json({ success: false, message: "Eroare internă bază date." });
        }
        if (!user) {
            console.log("[LOGIN FAIL] Userul nu a fost găsit în DB.");
            return res.json({ success: false, message: "Utilizator inexistent." });
        }

        // Verificăm parola cu bcryptjs
        const passwordIsValid = bcrypt.compareSync(password, user.password);
        
        if (passwordIsValid) {
            console.log("[LOGIN SUCCESS] Parolă corectă!");
            req.session.userId = user.id;
            req.session.username = user.username;
            res.json({ success: true });
        } else {
            console.log("[LOGIN FAIL] Parolă greșită.");
            res.json({ success: false, message: "Parolă incorectă." });
        }
    });
});

// Ruta REGISTER cu Log-uri Detaliate
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    console.log(`[REGISTER ATTEMPT] User nou: ${username}`);

    // Hash parola simplu cu bcryptjs
    const hash = bcrypt.hashSync(password, 8);

    const sql = 'INSERT INTO users (username, password) VALUES (?, ?)';
    db.run(sql, [username, hash], function(err) {
        if (err) {
            console.error("[REGISTER ERROR]:", err.message);
            return res.json({ success: false, message: "Eroare: Probabil userul există deja." });
        }
        console.log(`[REGISTER SUCCESS] ID creat: ${this.lastID}`);
        res.json({ success: true, message: "Cont creat cu succes!" });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
