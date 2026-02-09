const sqlite3 = require('sqlite3').verbose();
const dbName = 'candycrush.db'; // Putem păstra numele sau schimba în 'botmanager.db'

const db = new sqlite3.Database(dbName, (err) => {
    if (err) console.error(err.message);
    else {
        console.log('DB Conectat.');
        // Tabela Useri (Admin Panel)
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`);
        
        // Tabela Boți Minecraft
        db.run(`CREATE TABLE IF NOT EXISTS bots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT,
            server_ip TEXT,
            version TEXT,
            proxy TEXT,
            auto_msg TEXT,
            auto_auth INTEGER DEFAULT 0
        )`);
    }
});

module.exports = db;
