import db from "../config/db.js";
import { v4 as uuidv4 } from "uuid";

function generateShareCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export async function createSharedCapture(
  ownerId: string | number,
  data: {
    id?: string;
    subject?: string;
    date?: string;
    start_time?: string;
    end_time: string;
  }
) {
  const captureId = data.id || uuidv4();
  const shareCode = generateShareCode();

  await db.query(
    `INSERT INTO shared_captures 
     (id, owner_id, share_code, subject, date, start_time, end_time, updated_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      captureId,
      parseInt(String(ownerId)),
      shareCode,
      data.subject || null,
      data.date || null,
      data.start_time || null,
      data.end_time || null,
    ]
  );

  return { captureId, shareCode };
}

export async function findSharedCapturesByUser(userId: number) {
  // Get captures owned by user
  const owned = await db.query(
    `SELECT sc.*, 'owner' as access_type
         FROM shared_captures sc
         WHERE sc.owner_id = ?
         ORDER BY sc.created_at DESC`,
    [userId]
  );

  // Get captures shared with user
  const shared = await db.query(
    `SELECT sc.*, cc.role as access_type, u.name as owner_name
         FROM shared_captures sc
         JOIN capture_collaborators cc ON sc.id = cc.capture_id
         LEFT JOIN users u ON sc.owner_id = u.id
         WHERE cc.user_id = ?
         ORDER BY sc.created_at DESC`,
    [userId]
  );

  return {
    owned: owned || [],
    shared: shared || [],
  };
}

export async function findSharedCaptureById(captureId: string) {
  const rows = await db.query(
    `SELECT * FROM shared_captures WHERE id = ? LIMIT 1`,
    [captureId]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

export async function findSharedCaptureByCode(shareCode: string) {
  const rows = await db.query(
    `SELECT * FROM shared_captures WHERE share_code = ? LIMIT 1`,
    [shareCode]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

export async function addCollaborator(
  captureId: string,
  userId: number,
  role: "viewer" | "editor" = "viewer"
) {
  await db.query(
    `INSERT INTO capture_collaborators (capture_id, user_id, role) 
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE role = VALUES(role)`,
    [captureId, userId, role]
  );
}

export async function removeCollaborator(captureId: string, userId: number) {
  await db.query(
    `DELETE FROM capture_collaborators
         WHERE capture_id = ? AND user_id = ?`,
    [captureId, userId]
  );
}

export async function getCollaborators(captureId: string) {
  const rows = await db.query(
    `SELECT u.id, u.name, u.email, cc.role, cc.joined_at
         FROM capture_collaborators cc
         JOIN users u ON cc.user_id = u.id
         WHERE cc.capture_id = ?`,
    [captureId]
  );
  return rows || [];
}

export async function upsertRoster(
  captureId: string,
  roster: Array<{
    id: string;
    name: string;
    present: boolean;
    time?: string | null;
    status?: string | null;
  }>
) {
  await db.query(`DELETE FROM capture_roster WHERE capture_id = ?`, [
    captureId,
  ]);

  if (roster.length === 0) return 0;

  // Insert new roster
  const values = roster.map((r) => [
    captureId,
    r.id,
    r.name,
    r.present ? 1 : 0,
    r.time || null,
    r.status || "Absent",
  ]);

  const placeholders = values.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
  const flatValues = values.flat();

  await db.query(
    `INSERT INTO capture_roster (capture_id, student_id, student_name, present, time_marked, status)
         VALUES ${placeholders}`,
    flatValues
  );

  return roster.length;
}

export async function getRoster(captureId: string) {
  const rows = await db.query(
    `SELECT student_id as id, student_name as name, present, time_marked as time, status
     FROM capture_roster
     WHERE capture_id = ?
     ORDER BY student_name`,
    [captureId]
  );
  return rows || [];
}

export async function updateSharedCapture(
  captureId: string,
  data: {
    subject?: string;
    date?: string;
    start_time?: string;
    end_time?: string;
  }
) {
  const fields: string[] = [];
  const values: any[] = [];

  if (data.subject !== undefined) {
    fields.push("subject = ?");
    values.push(data.subject);
  }
  if (data.date !== undefined) {
    fields.push("date = ?");
    values.push(data.date);
  }
  if (data.start_time !== undefined) {
    fields.push("start_time = ?");
    values.push(data.start_time);
  }
  if (data.end_time !== undefined) {
    fields.push("end_time = ?");
    values.push(data.end_time);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = NOW()");

  values.push(captureId);
  await db.query(
    `UPDATE shared_captures SET ${fields.join(", ")} WHERE id = ?`,
    values
  );
}

export async function deleteSharedCapture(captureId: string) {
  await db.query(`DELETE FROM shared_captures WHERE id = ?`, [captureId]);
}

export async function hasAccess(
  userId: number,
  captureId: string
): Promise<{ hasAccess: boolean; role: string | null }> {
  // Check if owner
  const ownerCheck = await db.query(
    `SELECT 1 FROM shared_captures WHERE id = ? AND owner_id = ?`,
    [captureId, userId]
  );
  if (ownerCheck && ownerCheck.length > 0) {
    return { hasAccess: true, role: "owner" };
  }

  // Check if collaborator
  const collabCheck = await db.query(
    `SELECT role FROM capture_collaborators WHERE capture_id = ? AND user_id = ?`,
    [captureId, userId]
  );
  if (collabCheck && collabCheck.length > 0) {
    return { hasAccess: true, role: collabCheck[0].role };
  }

  return { hasAccess: false, role: null };
}
