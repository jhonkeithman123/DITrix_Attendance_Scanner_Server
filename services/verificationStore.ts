import { run, get } from "./userStore.js";

/**
 * Row shape returned from email_verification
 */
type VerificationRow = {
  id: number;
  email: string;
  code: string;
  expires_at: string | null;
  attempts: number;
  created_at: string;
} | null;

/**
 * Return latest verification row for email or null
 * { id, email, code, expires_at, attempts, created_at }
 */
export async function getVerification(email: string): Promise<VerificationRow> {
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
  email: string,
  code: string,
  expiresIso: string | null,
  options: { force?: boolean } = { force: false }
): Promise<VerificationRow> {
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

  await run(
    `INSERT INTO email_verifications (email, code, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, NOW())`,
    [email, code, expiresIso || null]
  );

  return await getVerification(email);
}

export async function deleteVerification(email: string): Promise<void> {
  await run(`DELETE FROM email_verifications WHERE email = ?`, [email]);
}

/**
 * Increment attempts on the latest verification row for the email.
 */
export async function incAttempts(email: string): Promise<boolean> {
  const row = await getVerification(email);
  if (!row) return false;
  await run(
    `UPDATE email_verifications SET attempts = COALESCE(attempts,0) + 1 WHERE id = ?`,
    [row.id]
  );
  return true;
}
