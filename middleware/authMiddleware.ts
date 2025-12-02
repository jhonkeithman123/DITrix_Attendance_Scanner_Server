import { findSessionByToken, deleteSession } from "../services/sessionStore.js";
import { findById as findUserById } from "../services/userStore.js";
import { Request, Response, NextFunction } from "express";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

type PublicUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
};

type AuthRequest = Request & {
  user?: PublicUser;
  authToken?: string;
};

/**
 * Auth middleware:
 * - expects Authorization: Bearer <token>
 * - requires a session row for the token (sessions.id == token)
 * - if JWT_SECRET present, verifies signature as well
 * - attaches req.user with the user's public profile
 */
export default async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const auth = (req.headers?.authorization || "").trim();
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parts = auth.split(" ");
    const token = parts[1];
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
    let payload: (JwtPayload & { id?: string }) | null = null;
    if (process.env.JWT_SECRET) {
      try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        if (typeof verified === "object" && verified !== null) {
          // cast to JWTPayload and allow an optional id field
          payload = verified as JwtPayload & { id?: string };
        } else {
          // string payloads are not supported for my tokens
          await deleteSession(token).catch(() => {});
          return res.status(401).json({ error: "Invalid token" });
        }
      } catch (e: any) {
        await deleteSession(token).catch(() => {});
        return res.status(500).json({ error: "Server error" });
      }
    }

    const userId = session.user_id ?? payload?.id ?? null;
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
