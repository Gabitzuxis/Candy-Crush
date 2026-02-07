import express from "express";
import http from "http";
import { Server } from "socket.io";
import mineflayer from "mineflayer";
import session from "express-session";
import SQLiteStore from "connect-sqlite3";
import bcrypt from "bcrypt";
import Database from "better-sqlite3";


const db = new Database("database.db");


// DB tables


db.prepare(`CREATE TABLE IF NOT EXISTS admins (
id INTEGER PRIMARY KEY AUTOINCREMENT,
username TEXT UNIQUE,
password TEXT
)`).run();


// default admin: admin / kadopa193a!
const exists = db.prepare("SELECT * FROM admins WHERE username=?").get("admin");
if (!exists) {
const hash = await bcrypt.hash("kadopa193a!", 10);
db.prepare("INSERT INTO admins (username,password) VALUES (?,?)").run("admin", hash);
}


const app = express();
const server = http.createServer(app);
const io = new Server(server);


const SQLiteStoreSession = SQLiteStore(session);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
store: new SQLiteStoreSession({ db: 'sessions.db' }),
secret: 'minecraft-secret',
resave: false,
saveUninitialized: false
}));


app.use(express.static("public"));


function auth(req, res, next) {
if (!req.session.user) return res.redirect("/login.html");
next();
}


app.post("/login", async (req, res) => {
const { username, password } = req.body;
const user = db.prepare("SELECT * FROM admins WHERE username=?").get(username);
if (!user) return res.redirect("/login.html");


const ok = await bcrypt.compare(password, user.password);
if (!ok) return res.redirect("/login.html");


req.session.user = username;
res.redirect("/");
});


app.get("/logout", (req, res) => {
req.session.destroy(() => res.redirect("/login.html"));
});


app.use(auth);