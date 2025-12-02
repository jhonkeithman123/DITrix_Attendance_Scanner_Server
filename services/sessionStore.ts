import type { RowDataPacket } from "mysql2/promise";
import db from "../config/db.js";
import { toMySqlDatetimeUTC, parseDbDateUtc } from "../utils/sessionUtils.js";

export type SessionRow = {
  id: string;
  user_id: string | null;
  date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
};

/**
 * Store (or replace) a session by token.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for upsert.
 */
export async function createSession(
  token: string,
  userId: string | number,
  expiresAt: string | Date | null = null,
  extra: Record<string, any> = {}
): Promise<boolean> {
  const now = new Date();
  const createdAt = toMySqlDatetimeUTC(now);
  const updatedAt = createdAt;
  const dateOnly = createdAt.slice(0, 10);

  const sql = `
    INSERT INTO sessions
      (id, user_id, date, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      date = VALUES(date),
      updated_at = VALUES(updated_at),
      expires_at = VALUES(expires_at)
  `;

  let expiresSql: string | null = null;
  if (expiresAt instanceof Date) {
    expiresSql = toMySqlDatetimeUTC(expiresAt);
  } else if (typeof expiresAt === "string" && expiresAt.trim() !== "") {
    const parsed = parseDbDateUtc(expiresAt);
    if (parsed) {
      expiresSql = toMySqlDatetimeUTC(parsed);
    }
  }

  const params = [
    token,
    String(userId),
    extra.date ?? dateOnly,
    createdAt,
    updatedAt,
    expiresSql,
  ];

  await db.query(sql, params);
  return true;
}

export async function findSessionByToken(
  token: string
): Promise<RowDataPacket | null> {
  const res: any = await db.query(
    "SELECT * FROM sessions WHERE id = ? LIMIT 1",
    [token]
  );
  const rows = Array.isArray(res) && Array.isArray(res[0]) ? res[0] : res;
  if (!rows || rows.length === 0) return null;
  return rows[0] as RowDataPacket;
}

export async function deleteSession(token: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE id = ?", [token]);
}

export async function deleteSessionsByUser(
  userId: string | number
): Promise<void> {
  await db.query("DELETE FROM sessions WHERE user_id = ?", [String(userId)]);
}

// extend/refresh an existing session's expires_at
export async function extendSession(
  token: string,
  ttlSeconds = 7 * 24 * 60 * 60
): Promise<string | null> {
  if (!token) throw new Error("Missing token");

  const rec = await findSessionByToken(token);
  if (!rec) return null;

  const newExpires = new Date(Date.now() + ttlSeconds * 1000);
  const newExpiresSql = toMySqlDatetimeUTC(newExpires);

  await db.query(
    "UPDATE sessions SET expires_at = ?, updated_at = ? WHERE id = ?",
    [newExpiresSql, toMySqlDatetimeUTC(new Date()), token]
  );
  return newExpires.toISOString();
}
