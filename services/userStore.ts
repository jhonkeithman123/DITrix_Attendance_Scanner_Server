import bcrypt from "bcryptjs";
import db, { admin } from "../config/firestore.js";

type PublicProfile = {
  id: string;
  email: string;
  name: string;
  avatar_url: string;
  verified: boolean;
  passwordHash?: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

function toIso(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

function toPublic(id: string, data: any): PublicProfile {
  return {
    id,
    email: data.email,
    name: data.name ?? "",
    avatar_url: data.avatar_url ?? "",
    verified: !!data.verified,
    passwordHash: data.password_hash || null,
    created_at: toIso(data.created_at),
    updated_at: toIso(data.updated_at),
  };
}

export async function findByEmail(email: string) {
  const q = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (q.empty) return null;
  return {
    ...toPublic(q.docs[0].id, q.docs[0].data()),
    passwordHash: q.docs[0].data().password_hash ?? null,
  };
}

export async function findOneBy(param: string, value: any) {
  const q = await db
    .collection("users")
    .where(param, "==", value)
    .limit(1)
    .get();
  if (q.empty) return null;
  return {
    ...toPublic(q.docs[0].id, q.docs[0].data()),
    passwordHash: q.docs[0].data().password_hash ?? null,
  };
}

export async function findById(id: string | number) {
  if (!id) return null;
  const doc = await db.collection("users").doc(String(id)).get();
  if (!doc.exists) return null;
  const d = doc.data()!;
  return {
    id: doc.id,
    email: d.email,
    name: d.name ?? "",
    avatar_url: d.avatar_url ?? "",
    verified: !!d.verified,
  };
}

export async function createUser({
  email,
  password,
  name = "",
}: {
  email: string;
  password: string;
  name?: string;
}) {
  const existing = await findByEmail(email);
  if (existing) throw new Error("UserExists");
  const passwordHash = await bcrypt.hash(password, 10);
  const now = admin.firestore.Timestamp.now();
  const docRef = db.collection("users").doc(); // auto id
  await docRef.set({
    email,
    password_hash: passwordHash,
    name,
    avatar_url: "",
    created_at: now,
    verified: false,
  });
  return {
    id: docRef.id,
    email,
    name,
    avatar_url: "",
    created_at: now.toDate().toISOString(),
  };
}

export async function verifyPassword(email: string, password: string) {
  const user = await findByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash ?? "");
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
  };
}

export async function updatePasswordByEmail(
  email: string,
  newPassword: string
) {
  if (!newPassword || newPassword.length < 8)
    throw new Error("invalid_password");
  const q = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (q.empty) throw new Error("UserNotFound");
  const docRef = q.docs[0].ref;
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await docRef.update({
    password_hash: passwordHash,
    updated_at: admin.firestore.Timestamp.now(),
  });
  return true;
}

export async function updateProfileById(
  id: string | number,
  { name, avatar_url }: { name?: string; avatar_url?: string }
) {
  if (!id) throw new Error("Missing id");
  const docRef = db.collection("users").doc(String(id));
  const data: any = {};
  if (name !== undefined) data.name = name;
  if (avatar_url !== undefined) data.avatar_url = avatar_url;
  if (Object.keys(data).length === 0) return null;
  data.updated_at = admin.firestore.Timestamp.now();
  await docRef.set(data, { merge: true });
  const snap = await docRef.get();
  if (!snap.exists) return null;
  return toPublic(snap.id, snap.data());
}

// new helper to set verified flag (used by auth verify route)
export async function setVerifiedByEmail(email: string): Promise<boolean> {
  const q = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (q.empty) return false;
  await q.docs[0].ref.update({
    verified: true,
    updated_at: admin.firestore.Timestamp.now(),
  });
  return true;
}
