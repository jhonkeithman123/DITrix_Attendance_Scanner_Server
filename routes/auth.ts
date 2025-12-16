import express, { Request, Response } from "express";
import {
  createUser,
  findByEmail,
  findOneBy,
  updatePasswordByEmail,
  verifyPassword,
  findById as findUserById,
} from "../services/userStore.js";
import { admin } from "../config/firestore.js";
import {
  upsertVerification,
  getVerification,
  deleteVerification,
  incAttempts,
} from "../services/verificationStore.js";
import { sendVerificationEmail } from "../services/mailService.js";
import {
  createSession,
  findSessionByToken,
  deleteSession,
  extendSession,
} from "../services/sessionStore.js";
import {
  generateCode,
  parseDbDateUtc,
  toMySqlDatetimeUTC,
  generateToken,
} from "../utils/sessionUtils.js";
import authMiddleware from "../middleware/authMiddleware.js";
import { isDbAvailable } from "../config/firestore.js";
import { setVerifiedByEmail } from "../services/userStore.js";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();
const router = express.Router();

//* Temporary route to debug session
router.get("/debug/session-by-token", async (req: Request, res: Response) => {
  if (!isDbAvailable()) return;
});

router.get("/session", async (req: Request, res: Response) => {
  if (!isDbAvailable())
    return res.status(503).json({ error: "Database unavailable" });

  try {
    const auth = (req.headers.authorization || "").toString();
    if (!auth.startsWith("Bearer "))
      return res.status(401).json({ error: "Missing token" });

    const token = auth.split(" ")[1].trim();
    if (!token) return res.status(401).json({ error: "Missing token" });

    console.log("[auth/session] token(head):", token.slice(0, 12));

    let decoded: any;
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (e) {
      console.error("[auth/session] verifyIdToken failed:", e);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const uid = decoded.uid as string | undefined;
    const email = decoded.email as string | undefined;
    if (!uid && !email)
      return res.status(401).json({ error: "Invalud token payload" });

    let user = uid ? await findUserById(uid) : null;
    if (!user && email) user = await findByEmail(email);
    if (!user) return res.status(404).json({ error: "User not found" });

    return res.json({
      status: "ok",
      profile: {
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err) {
    console.error("session validation error:", err);
    return res.status(500).json({ error: "Session check failed" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  if (!isDbAvailable()) return;

  try {
    const token = req.headers.authorization?.split(" ")[1];
    console.log("Token on the request object: ", token);
    if (!token) {
      return res.status(400).json({ error: "No token provided" });
    }

    // Delete the session so token becomes invalid
    const result = await findSessionByToken(token);
    if (!result) {
      console.error("The session from the token is not found:", result);
      return res.status(404).json({ error: "Session not found." });
    }

    await deleteSession(token);

    res.json({ message: "Logged out successfully" });
  } catch (e) {
    console.error("[Logout] error:", e);
    res.status(500).json({ error: "Logout failed." });
  }
});

// POST /auth/refresh
// Verifies token (via middleware) and extends session expiry in DB.
// Returns { expiresAt: ISOString } on success.
router.post("/refresh", authMiddleware, async (req: Request, res: Response) => {
  if (!isDbAvailable()) return;

  try {
    const token =
      (req as any).authToken || (req.headers.authorization || "").split(" ")[1];
    if (!token) return res.status(400).json({ error: "Missing token" });

    const ttl = process.env.JWT_TTL
      ? parseInt(process.env.JWT_TTL, 10)
      : 7 * 24 * 60 * 60;
    const newExpires = await extendSession(token, ttl);
    if (!newExpires)
      return res.status(404).json({ error: "Session not found" });

    return res.json({ status: "ok", expiresAt: newExpires });
  } catch (e) {
    console.error("refresh session error:", e);
    return res.status(500).json({ error: "Failed to refresh session" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  if (!isDbAvailable()) {
    return res.status(503).json({ error: "Database unavailable" });
  }

  const { email, password } = req.body || {};
  console.table(req.body);
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  try {
    const profile = await verifyPassword(email, password);
    if (!profile) return res.status(401).json({ error: "Invalid credentials" });

    const token = generateToken(profile);
    let expiresAtIso;

    // persist session in DB so /auth/session can validate the token
    try {
      const ttlSeconds = process.env.JWT_TTL
        ? parseInt(process.env.JWT_TTL, 10)
        : 7 * 24 * 60 * 60;
      const expiresAtSql = toMySqlDatetimeUTC(
        new Date(Date.now() + ttlSeconds * 1000)
      );
      await createSession(token, profile.id, expiresAtSql);
      // return an ISO expiry (client-friendly) in UTC
      expiresAtIso = parseDbDateUtc(expiresAtSql)
        ? parseDbDateUtc(expiresAtSql)!.toISOString()
        : null;
    } catch (e) {
      console.error("Failed to persist session:", e);
      // Do not return success — report failure to client
      return res
        .status(500)
        .json({ error: "Failed to sign in (server error)" });
    }

    return res.json({
      token,
      expiresAt: expiresAtIso,
      profile: {
        name: profile.name,
        email: profile.email,
        avatar_url: profile.avatar_url,
      },
      notice: "Login_success",
    });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/signup", async (req: Request, res: Response) => {
  if (!isDbAvailable()) return;

  const { email, password, name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  // basic email + password rules
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  if (typeof password !== "string" || password.length < 8) {
    return res
      .status(400)
      .json({ error: "Password must be at least 8 characters" });
  }

  try {
    const existing = await findByEmail(email);
    if (existing) return res.status(400).json({ error: "User already exists" });

    if (name && typeof name === "string") {
      const existingByName = await findOneBy("name", name.trim());
      if (existingByName)
        return res.status(409).json({ error: "Username already taken" });
    }

    let fbUser;
    try {
      fbUser = await admin.auth().createUser({
        email,
        password,
        displayName: name || undefined,
      });
    } catch (e: any) {
      console.error("[signup] admin.auth().createuser error:", e);
      const code = e?.code || "";
      if (code === "auth/email-already-exists") {
        return res.status(400).json({ error: "User already exists" });
      }
      return res
        .status(500)
        .json({ error: "Failed to create auth user (server error)" });
    }

    const user = await createUser({
      uid: fbUser.uid,
      email,
      name: name || "",
      avatar_url: fbUser.photoURL || "",
    });

    const code = generateCode();
    const expires = toMySqlDatetimeUTC(new Date(Date.now() + 1000 * 60 * 15));
    const row = await upsertVerification(email, code, expires, {
      force: false,
    });

    const codeToSend = row?.code;

    try {
      await sendVerificationEmail(email, codeToSend as string);
      console.log("Email verification code sent");

      return res.status(201).json({
        status: "ok",
        profile: {
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
        },
        notice: "verification_sent",
      });
    } catch (mailErr) {
      console.error("Failed to send verification email:", mailErr);

      return res.status(201).json({
        status: "ok",
        profile: {
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
        },
        notice: "account_created_email_failed",
      });
    }
  } catch (err) {
    console.error("signup error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/resend", async (req: Request, res: Response) => {
  if (!isDbAvailable()) return;

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const user = await findByEmail(email);
    if (!user) return res.status(404).json({ error: "No such user" });

    const existing = await getVerification(email);
    const now = new Date();
    let codeToSend: string | undefined;

    if (existing && existing.expires_at) {
      const existingExpires = parseDbDateUtc(existing.expires_at);
      if (existingExpires && existingExpires > now) {
        return res.status(201).json({
          status: "ok",
          message: "Interruption detected. You can enter the previous code.",
        });
      } else {
        const code = generateCode();
        const expires = toMySqlDatetimeUTC(
          new Date(Date.now() + 1000 * 60 * 15)
        );
        const row = await upsertVerification(email, code, expires, {
          force: true,
        });
        codeToSend = row?.code;
      }
    }

    try {
      await sendVerificationEmail(email, codeToSend as string);
      return res.json({ status: "ok", notice: "verification_sent" });
    } catch (mailErr) {
      console.error("resend mail error:", mailErr);
      return res
        .status(500)
        .json({ error: "Failed to send verification email" });
    }
  } catch (err) {
    console.error("resend error:", err);
    return res.status(500).json({ error: "Failed to resend code" });
  }
});

router.post("/verify", async (req: Request, res: Response) => {
  if (!isDbAvailable()) return;

  const { email, code } = req.body || {};
  if (!email || !code)
    return res.status(400).json({ error: "Email and code required" });

  try {
    const row = await getVerification(email);
    if (!row) return res.status(400).json({ error: "No verification pending" });

    const expiresAt = row.expires_at ? parseDbDateUtc(row.expires_at) : null;
    if (expiresAt && expiresAt < new Date()) {
      await deleteVerification(email);
      return res.status(400).json({ error: "Code expired" });
    }

    if (String(row.code) !== String(code)) {
      await incAttempts(email);
      return res.status(400).json({ error: "Invalid code" });
    }

    try {
      const ok = await setVerifiedByEmail(email);
      if (!ok)
        return res.status(500).json({ error: "Failed to verify account" });
    } catch (e) {
      console.error("Failed to update user verified flag:", e);
      return res.status(500).json({ error: "Failed to verified account" });
    }

    await deleteVerification(email);
    return res.status(200).json({ status: "ok", message: "verified" });
  } catch (err) {
    console.error("verify error:", err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/forgot", async (req: Request, res: Response) => {
  if (!isDbAvailable()) return;

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const user = await findByEmail(email);

    // Always respond with a generic success to avoid account enumeration.
    if (!user) {
      return res.status(200).json({
        status: "ok",
        message: "If the account exists, a reset code was sent to the email.",
      });
    }

    // Reuse active code if present
    const existing = await getVerification(email);
    const now = new Date();
    if (existing && existing.expires_at) {
      const existingExpires = parseDbDateUtc(existing.expires_at);
      if (existingExpires && existingExpires > now) {
        return res.status(200).json({
          status: "ok",
          notice: "code_active",
          message: "A reset code is already active. Please check your email.",
        });
      }
    }

    // create and send a new reset code
    const code = generateCode();
    const expires = toMySqlDatetimeUTC(new Date(Date.now() + 1000 * 60 * 15));
    await upsertVerification(email, code, expires, { force: true });

    try {
      await sendVerificationEmail(email, code, "reset");
    } catch (mailErr) {
      console.error("Failed to send reset email:", mailErr);
      // don't propagate email errors to client
    }

    return res.status(200).json({
      status: "ok",
      message: "If the account exists, a reset code was sent to the email.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Failed to process request." });
  }
});

router.patch("/reset", async (req: Request, res: Response) => {
  if (!isDbAvailable()) return;

  const { email, code, newPassword } = req.body || {};
  console.table(req.body);
  if (!email || !code || !newPassword) {
    return res
      .status(400)
      .json({ error: "Email, code and newPassword are required" });
  }

  try {
    const row = await getVerification(email);
    if (!row) return res.status(400).json({ error: "No reset pending" });

    const expiresAt = row.expires_at ? parseDbDateUtc(row.expires_at) : null;
    if (expiresAt && expiresAt < new Date()) {
      await deleteVerification(email);
      return res.status(400).json({ error: "Invalid code" });
    }

    await updatePasswordByEmail(email, newPassword);

    await deleteVerification(email);
    return res.status(200).json({ status: "ok", message: "password_reset" });
  } catch (err) {
    console.error("password update failed:", err);
    return res.status(500).json({ error: "Failed to update password" });
  }
});

export default router;
