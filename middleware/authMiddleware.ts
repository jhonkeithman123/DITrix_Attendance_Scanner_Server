import { Request, Response, NextFunction } from "express";
import { admin } from "../config/firestore.js";
import { findById, findByEmail } from "../services/userStore";

type PublicUser = {
  id: string | number;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
};
type AuthRequest = Request & { user?: PublicUser; authToken?: string };

export default async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (req.method === "OPTIONS") return next();

    const auth = (req.headers.authorization || "").trim();
    if (!auth || !auth.toLowerCase().startsWith("bearer "))
      return res.status(401).json({ error: "Unauthorized" });
    const idToken = auth.split(" ")[1];

    //verify Firebase ID token
    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (e) {
      console.error("[auth] verifyIdToken failed:", e);
      return res.status(401).json({ error: "Invlaid or expired token" });
    }

    const uid = decoded.uid;
    const email = (decoded as any).email as string | undefined;

    // try to find the user document uid, then by email
    let user = uid ? await findById(uid) : null;
    if (!user && email) user = await findByEmail(email);

    if (!user && (uid || email)) {
      const now = admin.firestore.FieldValue.serverTimestamp();
      const docRef = admin
        .firestore()
        .collection("users")
        .doc(uid || email);
      await docRef.set(
        {
          email: email ?? null,
          name: decoded.name ?? null,
          avatar_url: decoded.picture ?? null,
          verified: true,
          created_at: now,
          updated_at: now,
        },
        { merge: true }
      );
      user = {
        id: uid || email || docRef.id,
        email: email ?? null,
        name: decoded.name,
        avatar_url: decoded.picture ?? null,
        verified: true,
      } as any;
    }

    if (!user) return res.status(404).json({ error: "User not found." });

    req.user = {
      id: user.id,
      email: (user as any).email,
      name: (user as any).name,
      avatar_url: (user as any).avatar_url,
    };
    req.authToken = idToken;
    return next();
  } catch (err) {
    console.error("auth middleware errro:", err);
    return res.status(500).json({ errro: "Authentication failed." });
  }
}
