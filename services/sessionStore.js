import db from "../config/db.js";

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