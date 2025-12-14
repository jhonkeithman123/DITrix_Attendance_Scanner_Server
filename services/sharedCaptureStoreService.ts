import db, { admin } from "../config/firestore";

export async function createSharedCapture(ownerId: string | number, data: any) {
  const id = data.id ?? db.collection("shared_captures").doc().id;
  const docRef = db.collection("shared_captures").doc(String(id));
  const now = admin.firestore.FieldValue.serverTimestamp();
  await docRef.set({
    id: String(id),
    owner_id: String(ownerId),
    share_code: data.share_code ?? "",
    subject: data.subject ?? null,
    date: data.date ?? null,
    start_time: data.start_time ?? null,
    end_time: data.end_time ?? null,
    created_at: now,
    updated_at: now,
  });
  const snap = await docRef.get();
  return snap.exists ? snap.data() : null;
}

export async function findSharedCapturesByUser(userId: number) {
  const q = db
    .collection("shared_captures")
    .where("owner_id", "==", String(userId));
  const snap = await q.get();
  return snap.docs.map((d) => d.data());
}

export async function getSharedCapture(id: string) {
  const snap = await db.collection("shared_captures").doc(id).get();
  return snap.exists ? snap.data() : null;
}

export async function updateSharedCapture(id: string, updates: any) {
  const docRef = db.collection("shared_captures").doc(id);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const toSet: any = { ...updates, updated_at: now };
  await docRef.update(toSet);
  const snap = await docRef.get();
  return snap.exists ? snap.data() : null;
}

export async function upsertRoster(captureId: string, roster: any[]) {
  if (!Array.isArray(roster)) return;
  const batch = db.batch();
  const col = db
    .collection("shared_captures")
    .doc(captureId)
    .collection("roster");
  roster.forEach((r) => {
    const doc = col.doc(
      String(r.student_id ?? r.id ?? db.collection("_").doc().id)
    );
    batch.set(
      doc,
      {
        student_id: String(r.student_id ?? r.id),
        student_name: r.student_name ?? r.name ?? "",
        present: !!r.present,
        time_marked: r.time_marked
          ? admin.firestore.Timestamp.fromDate(new Date(r.time_marked))
          : null,
        status: r.status ?? null,
      },
      { merge: true }
    );
  });
  await batch.commit();
}

export async function addCollaborator(
  captureId: string,
  userId: number,
  role: "viewer" | "editor" = "viewer"
) {
  const docRef = db
    .collection("shared_captures")
    .doc(captureId)
    .collection("collaborators")
    .doc(String(userId));
  await docRef.set(
    {
      user_id: String(userId),
      role,
      joined_at: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listRoster(captureId: string) {
  const snap = await db
    .collection("shared_captures")
    .doc(captureId)
    .collection("roster")
    .get();
  return snap.docs.map((d) => d.data());
}

export async function listCollaborators(captureId: string) {
  const snap = await db
    .collection("shared_captures")
    .doc(captureId)
    .collection("collaborators")
    .get();
  return snap.docs.map((d) => d.data());
}
