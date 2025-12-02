import bcrypt from "bcryptjs";
import db from "../config/db.js";
import { v4 as uuidv4 } from "uuid";

type DB = {
  query: (sql: string, params?: any[]) => Promise<[any[], any]>;
};

type RawUserRow = {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  password_hash?: string | null;
  verified?: number | boolean | null;
};

export type PublicProfile = {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  created_at: string | null;
};

type UserWithHash = PublicProfile & { passwordHash?: string | null };

/**
 * MySQL-compatible promise helpers (wrap db.query)
 * db.query(...) returns [rows, fields] via mysql2/promise pool
 */
export const run = async (
  sql: string,
  params: any[] = []
): Promise<boolean> => {
  await db.query(sql, params);
  return true;
};

export const get = async <T = any>(
  sql: string,
  params: any[] = []
): Promise<T | null> => {
  const [rows] = await db.query(sql, params);
  return rows && rows.length ? rows[0] : null;
};

export const all = async <T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> => {
  const [rows] = await db.query(sql, params);
  return rows || [];
};

function _mapRow(row: RawUserRow | null): UserWithHash | null {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name ?? "",
    avatar_url: row.avatar_url ?? "",
    created_at: row.created_at ?? null,
    passwordHash: row.password_hash ?? null,
  };
}

export async function findByEmail(email: string): Promise<UserWithHash | null> {
  const row = await get<RawUserRow>(
    `SELECT id, email, name, avatar_url, password_hash, created_at
     FROM users WHERE email = ? LIMIT 1`,
    [email]
  );
  return _mapRow(row);
}

/**
 *
 * @param {param} -> The columns in the table ex 'email', 'name', etc.
 * @param {value} -> The variable you will insert.
 */
export async function findOneBy(
  param: string,
  value: any
): Promise<UserWithHash | null> {
  const row = await get(`SELECT * FROM users WHERE ${param} = ? LIMIT 1`, [
    value,
  ]);

  return _mapRow(row);
}

/**
 * Find user by id (returns public profile or null)
 */
export async function findById(id: string): Promise<{
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  verified: boolean;
} | null> {
  if (!id) return null;
  const row = await get<RawUserRow>(
    `SELECT id, email, name, avatar_url, verified FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url,
    verified: !!row.verified,
  };
}

export async function createUser({
  email,
  password,
  name = "",
}: {
  email: string;
  password: string;
  name?: string;
}): Promise<PublicProfile> {
  const existing = await findByEmail(email);
  if (existing) throw new Error("UserExists");

  const passwordHash = await bcrypt.hash(password, 10);
  const id = uuidv4();
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  await run(
    `INSERT INTO users (id, email, password_hash, name, avatar_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
    [id, email, passwordHash, name, "", now]
  );

  return {
    id,
    email,
    name,
    avatar_url: "",
    created_at: now,
  };
}

export async function verifyPassword(
  email: string,
  password: string
): Promise<RawUserRow | null> {
  const row = await get<RawUserRow>(
    `SELECT id, email, name, avatar_url, password_hash, created_at
        FROM users WHERE email = ? LIMIT 1`,
    [email]
  );

  if (!row) return null;
  const ok = await bcrypt.compare(password, row.password_hash ?? "");

  if (!ok) return null;

  return {
    id: String(row.id),
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url ?? null,
    created_at: row.created_at ?? null,
  };
}

/**
 * Update user's password (hashes) by email.
 * Throws if DB error occures or user not found.
 */
export async function updatePasswordByEmail(
  email: string,
  newPassword: string
): Promise<boolean> {
  if (!email) throw new Error("email is required.");
  if (
    !newPassword ||
    typeof newPassword !== "string" ||
    newPassword.length < 8
  ) {
    throw new Error("invalid_password");
  }

  const existing = await findByEmail(email);
  if (!existing) throw new Error("UserNotFound");

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await run(`UPDATE users SET password_hash = ? WHERE email = ?`, [
    passwordHash,
    email,
  ]);
  return true;
}

export async function updateProfileById(
  id: string,
  { name, avatar_url }: { name?: string; avatar_url?: string }
): Promise<RawUserRow | null> {
  if (!id) throw new Error("Missing id");
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const sets = [];
  const params = [];
  if (name !== undefined) {
    sets.push("name = ?");
    params.push(name);
  }
  if (avatar_url !== undefined) {
    sets.push("avatar_url = ?");
    params.push(avatar_url);
  }
  if (sets.length === 0) return null;
  params.push(now, id); // updated_at, where id=?
  const sql = `UPDATE users SET ${sets.join(
    ", "
  )}, updated_at = ? WHERE id = ?`;
  await run(sql, params);
  const row = await get<{
    id: string;
    email: string;
    name: string;
    avatar_url?: string;
    verified: boolean;
  }>(`SELECT id, email, name, avatar_url, verified FROM users WHERE id = ?`, [
    id,
  ]);
  if (!row) return null;
  return {
    id: String(row.id),
    email: row.email,
    name: row.name ?? "",
    avatar_url: row.avatar_url ?? "",
    verified: !!row.verified,
  };
}
