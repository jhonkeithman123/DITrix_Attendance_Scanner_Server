import { run, get } from "./userStore.js";

/**
 * Return latest verification row for email or null
 * { id, email, code, expires_at, attempts, created_at }
 */
export async function getVerification(email) {
  return get(
    `SELECT id, email, code, expires_at, attempts, created_at
     FROM email_verifications
     WHERE email = ?
     ORDER BY id DESC
     LIMIT 1`,
    [email]
  );
}

/**
 * Insert a verification code. If a non-expired code exists and force=false, keep it.
 * Returns the active row after operation.
 *
 * Note: schema requires created_at (NOT NULL), so we use NOW().
 * expiresIso should be a MySQL DATETIME string or null.
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
    const expiresAt = existing.expires_at ? new Date(existing.expires_at) : null;
    if (expiresAt && expiresAt > now) {
      // keep existing unexpired code
      return existing;
    }
  }

  await run(
    `INSERT INTO email_verifications (email, code, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, NOW())`,
    [email, code, expiresIso || null]
  );

  return await getVerification(email);
}

export async function deleteVerification(email) {
  await run(`DELETE FROM email_verifications WHERE email = ?`, [email]);
}

/**
 * Increment attempts on the latest verification row for the email.
 */
export async function incAttempts(email) {
  const row = await getVerification(email);
  if (!row) return false;
  await run(`UPDATE email_verifications SET attempts = COALESCE(attempts,0) + 1 WHERE id = ?`, [
    row.id,
  ]);
  return true;
}