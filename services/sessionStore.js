import db from "../config/db.js";
import { run, get } from "./userStore.js";

/**
 * Initialize sessions support.
 * - If your sessions table already exists we won't recreate it.
 * - If expires_at column is missing we'll add it (safe one-time ALTER).
 */
export async function initSessions() {
  // check if sessions table exists
  const tbl = await get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
  );
  if (!tbl) {
    // fallback: create a minimal sessions table (compatible with your schema)
    await run(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      subject TEXT,
      date TEXT,
      start_time TEXT,
      end_time TEXT,
      created_at TEXT,
      updated_at TEXT,
      expires_at TEXT
    )`);
    return;
  }

  // check for expires_at column; if missing, add it
  const cols = await new Promise((resolve, reject) =>
    db.all(`PRAGMA table_info('sessions')`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    })
  );

  const hasExpires = cols.some((c) => c.name === "expires_at");
  if (!hasExpires) {
    try {
      await run(`ALTER TABLE sessions ADD COLUMN expires_at TEXT`);
      console.log("sessionStore: added expires_at column to sessions table");
    } catch (e) {
      console.warn(
        "sessionStore: failed to add expires_at column (it may already exist)",
        e
      );
    }
  }
}

/**
 * Store (or replace) a session by token.
 * - token -> stored in id column
 * - userId -> user_id column
 * - expiresAt -> ISO string or null
 */
export async function createSession(token, userId, expiresAt = null) {
  const now = new Date().toISOString();

  // Your existing sessions schema requires a non-null "date" column.
  // Use today's date (YYYY-MM-DD) for that column so INSERT won't fail.
  const dateOnly = now.split("T")[0];

  // insert or replace to update an existing token
  await run(
    `INSERT OR REPLACE INTO sessions (id, user_id, date, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [token, String(userId), dateOnly, expiresAt, now, now]
  );
  return true;
}

export async function findSessionByToken(token) {
  return get(`SELECT * FROM sessions WHERE id = ?`, [token]);
}

export async function deleteSession(token) {
  await run(`DELETE FROM sessions WHERE id = ?`, [token]);
}

export async function deleteSessionsByUser(userId) {
  await run(`DELETE FROM sessions WHERE user_id = ?`, [String(userId)]);
}

// extend/refresh an existing session's expires_at
export async function extendSession(token, ttlSeconds = 7 * 24 * 60 * 60) {
  if (!token) throw new Error("Missing token");
  const rec = await get(`SELECT * FROM sessions WHERE id = ?`, [token]);
  if (!rec) return null;
  const newExpires = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await run(`UPDATE sessions SET expires_at = ?, updated_at = ? WHERE id = ?`, [
    newExpires,
    new Date().toISOString(),
    token,
  ]);
  return newExpires;
}
