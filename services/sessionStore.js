import db from "../config/db.js";

/**
 * Initialize sessions support (MySQL).
 * - Creates sessions table if missing.
 * - Adds expires_at column if missing.
 */
export async function initSessions() {
  // Create sessions table if not exists (MySQL)
  const createSql = `
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(191) PRIMARY KEY,
      user_id VARCHAR(191),
      subject VARCHAR(255),
      date DATE,
      start_time TIME,
      end_time TIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_sessions_user (user_id(191)),
      INDEX idx_sessions_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  await db.query(createSql);

  // Ensure expires_at column exists (safe one-time add)
  try {
    const [cols] = await db.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [process.env.DB_NAME, "sessions"]
    );
    const hasExpires = (cols || []).some((c) => c.COLUMN_NAME === "expires_at");
    if (!hasExpires) {
      await db.query("ALTER TABLE sessions ADD COLUMN expires_at DATETIME");
      console.log("sessionStore: added expires_at column to sessions table");
    }
  } catch (e) {
    // non-fatal: log and continue
    console.warn("sessionStore: could not verify/alter columns:", e?.message || e);
  }
}

/**
 * Store (or replace) a session by token.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for upsert.
 */
export async function createSession(token, userId, expiresAt = null, extra = {}) {
  const now = new Date();
  const createdAt = now.toISOString().slice(0, 19).replace("T", " ");
  const updatedAt = createdAt;
  const dateOnly = now.toISOString().slice(0, 10);

  const sql = `
    INSERT INTO sessions
      (id, user_id, subject, date, start_time, end_time, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      subject = VALUES(subject),
      date = VALUES(date),
      start_time = VALUES(start_time),
      end_time = VALUES(end_time),
      updated_at = VALUES(updated_at),
      expires_at = VALUES(expires_at)
  `;

  const params = [
    token,
    String(userId),
    extra.subject || null,
    dateOnly,
    extra.start_time || null,
    extra.end_time || null,
    createdAt,
    updatedAt,
    expiresAt ? new Date(expiresAt).toISOString().slice(0, 19).replace("T", " ") : null,
  ];

  await db.query(sql, params);
  return true;
}

export async function findSessionByToken(token) {
  const [rows] = await db.query("SELECT * FROM sessions WHERE id = ? LIMIT 1", [token]);
  return rows && rows.length ? rows[0] : null;
}

export async function deleteSession(token) {
  await db.query("DELETE FROM sessions WHERE id = ?", [token]);
}

export async function deleteSessionsByUser(userId) {
  await db.query("DELETE FROM sessions WHERE user_id = ?", [String(userId)]);
}

// extend/refresh an existing session's expires_at
export async function extendSession(token, ttlSeconds = 7 * 24 * 60 * 60) {
  if (!token) throw new Error("Missing token");
  const rec = await findSessionByToken(token);
  if (!rec) return null;
  const newExpires = new Date(Date.now() + ttlSeconds * 1000);
  const newExpiresSql = newExpires.toISOString().slice(0, 19).replace("T", " ");
  await db.query("UPDATE sessions SET expires_at = ?, updated_at = ? WHERE id = ?", [
    newExpiresSql,
    new Date().toISOString().slice(0, 19).replace("T", " "),
    token,
  ]);
  return newExpires.toISOString();
}