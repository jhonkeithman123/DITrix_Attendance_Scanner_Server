import db from "../config/db.js";
import { run, get, all } from "./userStore.js";

/**
 * Ensure capture_session table exists.
 */
export async function initCaptureSessions() {
  await run(`CREATE TABLE IF NOT EXISTS capture_session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    subject TEXT,
    date TEXT,
    start_time TEXT,
    end_time TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
  )`);
}

/**
 * Upsert an array of capture objects for a given user.
 * Each capture may contain: capture_id (optional), subject, date, start_time, end_time.
 * Returns the number of successfully inserted rows.
 */
export async function upsertCapturesForUser(userId, captures) {
  if (!Array.isArray(captures) || captures.length === 0) return 0;

  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO capture_session
       (id, user_id, subject, date, start_time, end_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    let uploaded = 0;
    let hadError = null;

    db.serialize(() => {
      db.run("BEGIN TRANSACTION", (beginErr) => {
        if (beginErr) {
          try {
            stmt.finalize();
          } catch (_) {}
          return reject(beginErr);
        }

        for (const c of captures) {
          const id =
            c.capture_id ?? c.id ?? `${userId}:${Date.now()}:${Math.random()}`;
          const subject = c.subject ?? null;
          const date = c.date ?? null;
          const start_time = c.start_time ?? null;
          const end_time = c.end_time ?? null;

          stmt.run(
            id,
            String(userId),
            subject,
            date,
            start_time,
            end_time,
            now,
            now,
            function (err) {
              if (err) {
                // capture the first error but continue trying to insert others
                if (!hadError) hadError = err;
                console.error("upsert capture error:", err);
              } else {
                uploaded++;
              }
            }
          );
        }

        db.run("COMMIT", (commitErr) => {
          // finalize stmt and resolve/reject after finalize completes
          stmt.finalize((finalizeErr) => {
            if (commitErr || finalizeErr || hadError) {
              const err = commitErr || finalizeErr || hadError;
              return reject(err);
            }
            return resolve(uploaded);
          });
        });
      });
    });
  });
}

export async function findCaptureByUser(userId) {
  return all(
    `SELECT id, user_id, subject, date, start_time, end_time, created_at, updated_at
     FROM capture_session WHERE user_id = ? ORDER BY date DESC, start_time DESC`,
    [String(userId)]
  );
}

export async function findCaptureById(id) {
  return get(
    `SELECT id, user_id, subject, date, start_time, end_time, created_at, updated_at
     FROM capture_session WHERE id = ? LIMIT 1`,
    [id]
  );
}

export async function deleteCaptureById(id) {
  await run(`DELETE FROM capture_session WHERE id = ?`, [id]);
}

export async function deleteCapturesByUser(userId) {
  await run(`DELETE FROM capture_session WHERE user_id = ?`, [String(userId)]);
}
