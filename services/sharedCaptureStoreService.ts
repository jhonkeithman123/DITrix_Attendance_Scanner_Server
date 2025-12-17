import db, { admin } from "../config/firestore.js";

function tsToIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

export async function createSharedCapture(ownerId: string, data: any) {
  const id = data.id ?? db.collection("shared_captures").doc().id;
  const shareCode =
    data.share_code ?? Math.random().toString(36).slice(2, 9).toUpperCase();
  const docRef = db.collection("shared_captures").doc(String(id));
  const now = admin.firestore.FieldValue.serverTimestamp();
  await docRef.set(
    {
      id: String(id),
      owner_id: String(ownerId),
      share_code: shareCode,
      subject: data.subject ?? null,
      date: data.date ?? null,
      start_time: data.start_time ?? null,
      end_time: data.end_time ?? null,
      created_at: now,
      updated_at: now,
    },
    { merge: true }
  );
  return { captureId: String(id), shareCode };
}

export async function findSharedCapturesByUser(userId: string) {
  const userStr = String(userId);
  const ownedSnap = await db
    .collection("shared_captures")
    .where("owner_id", "==", userStr)
    .get();
  const owned = ownedSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      owner_id: data.owner_id,
      share_code: data.share_code,
      subject: data.subject ?? null,
      date: data.date ?? null,
      start_time: data.start_time ?? null,
      end_time: data.end_time ?? null,
      created_at: tsToIso(data.created_at),
      updated_at: tsToIso(data.updated_at),
    };
  });

  // collectionGroup query to find collaborator docs referencing this user
  const collSnap = await db
    .collectionGroup("collaborators")
    .where("user_id", "==", userStr)
    .get();
  const parentIds = new Set<string>();
  collSnap.docs.forEach((d) => {
    const parent = d.ref.parent.parent;
    if (parent) parentIds.add(parent.id);
  });

  const shared: any[] = [];
  if (parentIds.size > 0) {
    const promises = Array.from(parentIds).map(async (pid) => {
      const doc = await db.collection("shared_captures").doc(pid).get();
      if (doc.exists) {
        const data = doc.data()!;
        shared.push({
          id: doc.id,
          owner_id: data.owner_id,
          share_code: data.share_code,
          subject: data.subject ?? null,
          date: data.date ?? null,
          start_time: data.start_time ?? null,
          end_time: data.end_time ?? null,
          created_at: tsToIso(data.created_at),
          updated_at: tsToIso(data.updated_at),
        });
      }
    });
    await Promise.all(promises);
  }

  return { owned, shared };
}

export async function findSharedCaptureById(id: string) {
  const snap = await db.collection("shared_captures").doc(id).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    id: snap.id,
    owner_id: d.owner_id,
    share_code: d.share_code,
    subject: d.subject ?? null,
    date: d.date ?? null,
    start_time: d.start_time ?? null,
    end_time: d.end_time ?? null,
    created_at: tsToIso(d.created_at),
    updated_at: tsToIso(d.updated_at),
  };
}

export async function findSharedCaptureByCode(code: string) {
  const q = await db
    .collection("shared_captures")
    .where("share_code", "==", code)
    .limit(1)
    .get();
  if (q.empty) return null;
  const d = q.docs[0];
  const data = d.data();
  return {
    id: d.id,
    owner_id: data.owner_id,
    share_code: data.share_code,
    subject: data.subject ?? null,
    date: data.date ?? null,
    start_time: data.start_time ?? null,
    end_time: data.end_time ?? null,
    created_at: tsToIso(data.created_at),
    updated_at: tsToIso(data.updated_at),
  };
}

export async function updateSharedCapture(id: string, updates: any) {
  const docRef = db.collection("shared_captures").doc(id);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const toSet: any = { ...updates, updated_at: now };
  await docRef.set(toSet, { merge: true });
  const snap = await docRef.get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    id: snap.id,
    owner_id: d.owner_id,
    share_code: d.share_code,
    subject: d.subject ?? null,
    date: d.date ?? null,
    start_time: d.start_time ?? null,
    end_time: d.end_time ?? null,
    created_at: tsToIso(d.created_at),
    updated_at: tsToIso(d.updated_at),
  };
}

export async function deleteSharedCapture(id: string) {
  // delete roster and collaborators subcollections then the doc
  const rosterSnap = await db
    .collection("shared_captures")
    .doc(id)
    .collection("roster")
    .get();
  const collabSnap = await db
    .collection("shared_captures")
    .doc(id)
    .collection("collaborators")
    .get();
  const batch = db.batch();
  rosterSnap.docs.forEach((d) => batch.delete(d.ref));
  collabSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(db.collection("shared_captures").doc(id));
  await batch.commit();
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

export async function getRoster(captureId: string) {
  const snap = await db
    .collection("shared_captures")
    .doc(captureId)
    .collection("roster")
    .get();

  const rows = snap.docs.map((d) => {
    const data = d.data();
    return {
      student_id: data.student_id,
      student_name: data.student_name,
      present: !!data.present,
      time_marked: tsToIso(data.time_marked),
      status: data.status ?? null,
    };
  });

  rows.sort((a, b) =>
    (a.student_name || "")
      .toString()
      .toLowerCase()
      .localeCompare((b.student_name || "").toString().toLowerCase())
  );

  return rows;
}

export async function addCollaborator(
  captureId: string,
  userId: string | number,
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

export async function removeCollaborator(
  captureId: string,
  userId: string | number
) {
  await db
    .collection("shared_captures")
    .doc(captureId)
    .collection("collaborators")
    .doc(String(userId))
    .delete();
}

export async function getCollaborators(captureId: string) {
  const snap = await db
    .collection("shared_captures")
    .doc(captureId)
    .collection("collaborators")
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      user_id: data.user_id,
      role: data.role,
      joined_at: tsToIso(data.joined_at),
    };
  });
}

export async function hasAccess(userId: string, captureId: string) {
  const userStr = String(userId);
  const doc = await db.collection("shared_captures").doc(captureId).get();
  if (!doc.exists) return { hasAccess: false };
  const data = doc.data()!;
  if (data.owner_id === userStr) return { hasAccess: true, role: "owner" };
  const collDoc = await db
    .collection("shared_captures")
    .doc(captureId)
    .collection("collaborators")
    .doc(userStr)
    .get();
  if (collDoc.exists) {
    const cd = collDoc.data()!;
    return { hasAccess: true, role: cd.role ?? "viewer" };
  }
  return { hasAccess: false };
}

export async function captureAlreadyUploaded(id?: string | null) {
  if (!id) return false;
  const doc = await db.collection("shared_captures").doc(String(id)).get();
  return doc.exists;
}

export async function getAllStudents() {
  const snap = await db.collectionGroup("roster").get();
  const map = new Map<string, any>();
  snap.docs.forEach((d) => {
    const data = d.data();
    const sid = data.student_id ?? d.id;
    if (!map.has(sid)) {
      map.set(sid, {
        student_id: sid,
        student_name: data.student_name ?? null,
      });
    }
  });
  return Array.from(map.values());
}
