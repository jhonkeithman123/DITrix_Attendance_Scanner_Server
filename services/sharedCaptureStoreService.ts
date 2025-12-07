import db from "../config/db.js";
import { v4 as uuidv4 } from "uuid";
import { RowDataPacket } from "mysql2/promise";

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
  try {
    const ownedResult = await db.query(
      `SELECT sc.id, sc.owner_id, sc.share_code, sc.subject, sc.date,
              sc.start_time, sc.end_time, sc.created_at, sc.updated_at,
              'owner' AS access_type
       FROM shared_captures sc
       WHERE sc.owner_id = ?
       ORDER BY sc.created_at DESC`,
      [userId]
    );
    const ownedRows = Array.isArray(ownedResult) ? ownedResult[0] : ownedResult;

    const sharedResult = await db.query(
      `SELECT sc.id, sc.owner_id, sc.share_code, sc.subject, sc.date,
              sc.start_time, sc.end_time, sc.created_at, sc.updated_at,
              cc.role AS access_type, u.name AS owner_name
       FROM shared_captures sc
       JOIN capture_collaborators cc ON sc.id = cc.capture_id
       LEFT JOIN users u ON sc.owner_id = u.id
       WHERE cc.user_id = ?
       ORDER BY sc.created_at DESC`,
      [userId]
    );
    const sharedRows = Array.isArray(sharedResult)
      ? sharedResult[0]
      : sharedResult;

    return {
      owned: (ownedRows as any[]).map((row: any) => ({
        id: row.id as string,
        owner_id: row.owner_id as number,
        share_code: row.share_code as string,
        subject: (row.subject as string) ?? null,
        date: (row.date as string) ?? null,
        start_time: (row.start_time as string) ?? null,
        end_time: (row.end_time as string) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        access_type: row.access_type as string,
      })),
      shared: (sharedRows as any[]).map((row: any) => ({
        id: row.id as string,
        owner_id: row.owner_id as number,
        share_code: row.share_code as string,
        subject: (row.subject as string) ?? null,
        date: (row.date as string) ?? null,
        start_time: (row.start_time as string) ?? null,
        end_time: (row.end_time as string) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        access_type: row.access_type as string,
        owner_name: (row.owner_name as string) ?? null,
      })),
    };
  } catch (e) {
    console.error("[sharedCaptureStore] findSharedCapturesByUser error:", e);
    throw e;
  }
}

export async function findSharedCaptureById(captureId: string) {
  const result = await db.query(
    `SELECT * FROM shared_captures WHERE id = ? LIMIT 1`,
    [captureId]
  );
  const rows = Array.isArray(result) ? result[0] : result;
  return (rows as any[]).length ? (rows as any[])[0] : null;
}

export async function findSharedCaptureByCode(shareCode: string) {
  const result = await db.query(
    `SELECT * FROM shared_captures WHERE share_code = ? LIMIT 1`,
    [shareCode]
  );
  const rows = Array.isArray(result) ? result[0] : result;
  return (rows as any[]).length ? (rows as any[])[0] : null;
}

/// Check if a local capture has already been uploaded (by id)
export async function captureAlreadyUploaded(
  captureId: string
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM shared_captures WHERE id = ? LIMIT 1`,
    [captureId]
  );
  const rows = Array.isArray(result) ? result[0] : result;
  return (rows as any[]).length > 0;
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
  const result = await db.query(
    `SELECT u.id, u.name, u.email, cc.role, cc.joined_at
     FROM capture_collaborators cc
     JOIN users u ON cc.user_id = u.id
     WHERE cc.capture_id = ?`,
    [captureId]
  );
  const rows = Array.isArray(result) ? result[0] : result;
  return (rows as any[]) || [];
}

/// Get all students (users) in the system for invitation
export async function getAllStudents() {
  const result = await db.query(
    `SELECT id, name, email FROM users ORDER BY name ASC`
  );
  const rows = Array.isArray(result) ? result[0] : result;
  return (rows as any[]) || [];
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
  const result = await db.query(
    `SELECT student_id as id, student_name as name, present, time_marked as time, status
     FROM capture_roster
     WHERE capture_id = ?
     ORDER BY student_name`,
    [captureId]
  );
  const rows = Array.isArray(result) ? result[0] : result;
  return (
    (rows as any[]).map((row: any) => ({
      id: row.id,
      name: row.name,
      present: row.present === 1 || row.present === true, // Convert to bool
      time: row.time || null,
      status: row.status || "Absent",
    })) || []
  );
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
  const ownerResult = await db.query(
    `SELECT 1 FROM shared_captures WHERE id = ? AND owner_id = ?`,
    [captureId, userId]
  );
  const ownerRows = Array.isArray(ownerResult) ? ownerResult[0] : ownerResult;
  if ((ownerRows as any[]).length > 0) {
    return { hasAccess: true, role: "owner" };
  }

  // Check if collaborator
  const collabResult = await db.query(
    `SELECT role FROM capture_collaborators WHERE capture_id = ? AND user_id = ?`,
    [captureId, userId]
  );
  const collabRows = Array.isArray(collabResult)
    ? collabResult[0]
    : collabResult;
  if ((collabRows as any[]).length > 0) {
    return { hasAccess: true, role: (collabRows as any[])[0].role };
  }

  return { hasAccess: false, role: null };
}
