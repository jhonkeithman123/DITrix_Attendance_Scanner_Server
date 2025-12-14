import db, { admin } from "../config/firestore.js";

type VerificationRow = {
  id: string;
  email: string;
  code: string;
  expires_at: string | null;
  attempts: number;
  created_at: string | null;
} | null;

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

export async function getVerification(email: string): Promise<VerificationRow> {
  const q = db
    .collection("email_verifications")
    .where("email", "==", email)
    .orderBy("created_at", "desc")
    .limit(1);
  const snap = await q.get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return {
    id: d.id,
    email: data.email,
    code: data.code,
    expires_at: tsToIso(data.expires_at),
    attempts: data.attempts ?? 0,
    created_at: tsToIso(data.created_at),
  };
}

export async function upsertVerification(
  email: string,
  code: string,
  expiresIso: string | null,
  options: { force?: boolean } = { force: false }
): Promise<VerificationRow> {
  const existing = await getVerification(email);
  const nowTs = admin.firestore.Timestamp.now();

  if (!options.force && existing && existing.expires_at) {
    const ex = new Date(existing.expires_at);
    if (ex > new Date()) return existing;
  }

  const docRef = db.collection("email_verifications").doc();
  await docRef.set({
    email,
    code,
    expires_at: expiresIso
      ? admin.firestore.Timestamp.fromDate(new Date(expiresIso))
      : null,
    attempts: 0,
    created_at: nowTs,
  });

  const snap = await docRef.get();
  const d = snap.data()!;
  return {
    id: docRef.id,
    email: d.email,
    code: d.code,
    expires_at: tsToIso(d.expires_at),
    attempts: d.attempts ?? 0,
    created_at: tsToIso(d.created_at),
  };
}

export async function deleteVerification(email: string): Promise<void> {
  const snap = await db
    .collection("email_verifications")
    .where("email", "==", email)
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

export async function incAttempts(email: string): Promise<boolean> {
  const snap = await db
    .collection("email_verifications")
    .where("email", "==", email)
    .orderBy("created_at", "desc")
    .limit(1)
    .get();
  if (snap.empty) return false;
  const docRef = snap.docs[0].ref;
  await docRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
  return true;
}
