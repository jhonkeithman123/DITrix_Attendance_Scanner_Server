import { run, get } from "./userStore.js";
/**
 * Return verification row or null
 * { email, code, expires_at, attempts, created_at }
 */
export async function getVerification(email) {
  return get(
    `SELECT email, code, expires_at, attempts, created_at FROM email_verifications WHERE email = ? LIMIT 1`,
    [email]
  );
}

/**
 * Insert a verification code only if there's no unexpired code (unless force=true).
 * Returns the active row after operation.
 *
 * - If a non-expired code exists and force=false, it is kept and returned.
 * - Otherwise the function inserts/updates to the provided code/expires and returns that row.
 */
export async function upsertVerification(
  email,
  code,
  expiresIso,
  options = { force: false }
) {
  const now = new Date();
  const existing = await getVerification(email);

  if (!options.force && existing) {
    const expiresAt = existing.expires_at
      ? new Date(existing.expires_at)
      : null;
    if (expiresAt && expiresAt > now) {
      // keep existing unexpired code
      return existing;
    }
  }

  // insert or replace with new code
  await run(
    `INSERT INTO email_verifications (email, code, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at, attempts = 0, created_at = datetime('now')`,
    [email, code, expiresIso]
  );

  return await getVerification(email);
}

export async function deleteVerification(email) {
  await run(`DELETE FROM email_verifications WHERE email = ?`, [email]);
}

export async function incAttempts(email) {
  await run(
    `UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?`,
    [email]
  );
}
