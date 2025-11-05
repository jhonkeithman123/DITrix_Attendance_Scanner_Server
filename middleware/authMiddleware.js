import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { findSessionByToken, deleteSession } from "../services/sessionStore.js";
import { findById as findUserById } from "../services/userStore.js";

dotenv.config();

/**
 * Auth middleware:
 * - expects Authorization: Bearer <token>
 * - requires a session row for the token (sessions.id == token)
 * - if JWT_SECRET present, verifies signature as well
 * - attaches req.user with the user's public profile
 */
export default async function authMiddleware(req, res, next) {
  try {
    const auth = (req.headers?.authorization || "").trim();
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = auth.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const session = await findSessionByToken(token);
    if (!session) return res.status(401).json({ error: "Invalid session" });

    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      // cleanup expired session
      try {
        await deleteSession(token);
      } catch (_) {}
      return res.status(401).json({ error: "Session expired" });
    }

    // verify JWT signature when configured
    let payload = null;
    if (process.env.JWT_SECRET) {
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch (e) {
        try {
          await deleteSession(token);
        } catch (_) {}
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    const userId = session.user_id ?? (payload && payload.id) ?? null;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // attach a minimal user object and raw token to request
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    };

    req.authToken = token;
    return next();
  } catch (err) {
    console.error("auth middleware error:", err);
    return res.status(500).json({ error: "Authentication failed" });
  }
}
