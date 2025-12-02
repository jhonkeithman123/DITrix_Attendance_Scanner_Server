import { run, get, all } from "./userStore.js";
import { v4 as uuidv4 } from "uuid";

export type CaptureRow = {
  id: string;
  user_id: string;
  subject?: string | null;
  date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

/**
 * Upsert an array of capture objects for a given user.
 * Returns the number of successfully inserted/updated rows.
 */
export async function upsertCapturesForUser(
  userId: string | number,
  captures: Array<
    Partial<{
      capture_id: string;
      id: string;
      subject: string;
      date: string;
      start_time: string;
      end_time: string;
    }>
  >
): Promise<number> {
  if (!Array.isArray(captures) || captures.length === 0) return 0;

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const insertSql = `
    INSERT INTO capture_session
      (id, user_id, subject, date, start_time, end_time, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      subject = VALUES(subject),
      date = VALUES(date),
      start_time = VALUES(start_time),
      end_time = VALUES(end_time),
      updated_at = VALUES(updated_at)
  `;

  let uploaded = 0;
  try {
    await run("START TRANSACTION");
    for (const c of captures) {
      const id = (c.capture_id ?? c.id) || uuidv4();
      const subject = c.subject ?? null;
      const date = c.date ?? null;
      const start_time = c.start_time ?? null;
      const end_time = c.end_time ?? null;

      await run(insertSql, [
        id,
        String(userId),
        subject,
        date,
        start_time,
        end_time,
        now,
        now,
      ]);
      uploaded++;
    }
    await run("COMMIT");
  } catch (err) {
    try {
      await run("ROLLBACK");
    } catch (_) {}
    throw err;
  }

  return uploaded;
}

export async function findCaptureByUser(
  userId: string | number
): Promise<CaptureRow[]> {
  return all<CaptureRow>(
    `SELECT id, user_id, subject, date, start_time, end_time, created_at, updated_at
     FROM capture_session WHERE user_id = ? ORDER BY date DESC, start_time DESC`,
    [String(userId)]
  );
}

export async function findCaptureById(id: string): Promise<CaptureRow | null> {
  return get(
    `SELECT id, user_id, subject, date, start_time, end_time, created_at, updated_at
     FROM capture_session WHERE id = ? LIMIT 1`,
    [id]
  );
}

export async function deleteCaptureById(id: string): Promise<void> {
  await run(`DELETE FROM capture_session WHERE id = ?`, [id]);
}

export async function deleteCapturesByUser(
  userId: string | number
): Promise<void> {
  await run(`DELETE FROM capture_session WHERE user_id = ?`, [String(userId)]);
}
