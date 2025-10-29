import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";

const dbFile = "/mnt/c/Users/keith/Documents/SQLite3/attendance.sqlite3";

const parentDir = path.dirname(dbFile);
if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbFile, (err) => {
  if (err) {
    console.error("Failed to open SQLite DB:", err);
  } else {
    console.log("Opened SQLite DB at", dbFile);
  }
});

export const toDbString = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  return String(d);
};

export const parseDbString = (s) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      name TEXT,
      avatar_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      subject TEXT,
      date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      student_id TEXT,
      status TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      payload TEXT,
      attempts INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
});

export default db;
