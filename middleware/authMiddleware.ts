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

    // TODO: auto-create user doc if not present
    // if (!user && email) {
    //   user = await createUserFromFirebase({ uid, email, name: decoded.name });
    // }

    if (!user) return res.status(404).json({ error: "User not found." });

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
    };
    req.authToken = idToken;
    return next();
  } catch (err) {
    console.error("auth middleware errro:", err);
    return res.status(500).json({ errro: "Authentication failed." });
  }
}
