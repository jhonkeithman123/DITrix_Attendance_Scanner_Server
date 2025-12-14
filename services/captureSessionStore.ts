import db, { admin } from "../config/firestore.js";
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

export async function upsertCapturesForUser(
  userId: string | number,
  captures: Array<any>
): Promise<number> {
  if (!Array.isArray(captures) || captures.length === 0) return 0;
  const batch = db.batch();
  const now = admin.firestore.Timestamp.now();
  let count = 0;
  for (const c of captures) {
    const id = String(c.capture_id ?? c.id ?? uuidv4());
    const ref = db.collection("capture_sessions").doc(id);
    batch.set(
      ref,
      {
        id,
        user_id: String(userId),
        subject: c.subject ?? null,
        date: c.date ?? null,
        start_time: c.start_time ?? null,
        end_time: c.end_time ?? null,
        created_at: now,
        updated_at: now,
      },
      { merge: true }
    );
    count++;
  }
  await batch.commit();
  return count;
}

export async function findCaptureByUser(
  userId: string | number
): Promise<CaptureRow[]> {
  const snap = await db
    .collection("capture_sessions")
    .where("user_id", "==", String(userId))
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      user_id: data.user_id,
      subject: data.subject ?? null,
      date: data.date ?? null,
      start_time: data.start_time ?? null,
      end_time: data.end_time ?? null,
      created_at: data.created_at
        ? data.created_at.toDate().toISOString()
        : null,
      updated_at: data.updated_at
        ? data.updated_at.toDate().toISOString()
        : null,
    };
  });
}

export async function findCaptureById(id: string): Promise<CaptureRow | null> {
  const doc = await db.collection("capture_sessions").doc(id).get();
  if (!doc.exists) return null;
  const d = doc.data()!;
  return {
    id: doc.id,
    user_id: d.user_id,
    subject: d.subject ?? null,
    date: d.date ?? null,
    start_time: d.start_time ?? null,
    end_time: d.end_time ?? null,
    created_at: d.created_at ? d.created_at.toDate().toISOString() : null,
    updated_at: d.updated_at ? d.updated_at.toDate().toISOString() : null,
  };
}

export async function deleteCaptureById(id: string) {
  await db.collection("capture_sessions").doc(id).delete();
}

export async function deleteCapturesByUser(userId: string | number) {
  const snap = await db
    .collection("capture_sessions")
    .where("user_id", "==", String(userId))
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
