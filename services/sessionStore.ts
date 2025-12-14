import db, { admin } from "../config/firestore.js";

export type SessionRow = {
  id: string;
  token: string;
  user_id: string;
  date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  expires_at?: string | null;
};

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return null;
}

export async function createSession(
  token: string,
  userId: string | number,
  expiresAt: string | Date | null = null,
  extra: Record<string, any> = {}
): Promise<void> {
  const now = admin.firestore.Timestamp.now();
  const expires = expiresAt
    ? admin.firestore.Timestamp.fromDate(new Date(expiresAt))
    : null;
  const dateOnly = now.toDate().toISOString().slice(0, 10);
  await db
    .collection("sessions")
    .doc(token)
    .set(
      {
        token,
        user_id: String(userId),
        date: extra.date ?? dateOnly,
        created_at: now,
        updated_at: now,
        expires_at: expires,
        ...extra,
      },
      { merge: true }
    );
}

export async function findSessionByToken(
  token: string
): Promise<SessionRow | null> {
  const doc = await db.collection("sessions").doc(token).get();
  if (!doc.exists) return null;
  const d = doc.data() as any;
  return {
    id: doc.id,
    token: d.token ?? token,
    user_id: String(d.user_id),
    date: d.date ?? null,
    created_at: tsToIso(d.created_at),
    updated_at: tsToIso(d.updated_at),
    expires_at: tsToIso(d.expires_at),
  };
}

export async function deleteSession(token: string): Promise<void> {
  await db.collection("sessions").doc(token).delete();
}

export async function deleteSessionsByUser(
  userId: string | number
): Promise<void> {
  const snap = await db
    .collection("sessions")
    .where("user_id", "==", String(userId))
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

export async function extendSession(
  token: string,
  ttlSeconds = 7 * 24 * 60 * 60
): Promise<string | null> {
  const docRef = db.collection("sessions").doc(token);
  const doc = await docRef.get();
  if (!doc.exists) return null;
  const newExpires = new Date(Date.now() + ttlSeconds * 1000);
  await docRef.update({
    expires_at: admin.firestore.Timestamp.fromDate(newExpires),
    updated_at: admin.firestore.Timestamp.now(),
  });
  return newExpires.toISOString();
}
