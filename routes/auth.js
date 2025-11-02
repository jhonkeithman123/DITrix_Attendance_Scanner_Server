import express from "express";
import {
  createUser,
  findByEmail,
  findOneBy,
  updatePasswordByEmail,
} from "../services/userStore.js";
import {
  upsertVerification,
  getVerification,
  deleteVerification,
  incAttempts,
} from "../services/verificationStore.js";
import { sendVerificationEmail } from "../services/mailService.js";
import db from "../config/db.js";

const router = express.Router();

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  // TODO: do later
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  return res.json({
    token: "fake-jwt-token",
    profile: { name: "Test User", email, avatar_url: "" },
  });
});

router.post("/signup", async (req, res) => {
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

    const existingByName = await findOneBy("name", name.trim());
    if (existingByName)
      return res.status(409).json({ error: "Username already taken" });

    const user = await createUser({ email, password, name: name || "" });

    const code = generateCode();
    const expires = new Date(Date.now() + 1000 * 60 * 15).toISOString();
    const row = await upsertVerification(email, code, expires, {
      force: false,
    });

    const codeToSend = row.code;

    try {
      await sendVerificationEmail(email, codeToSend);
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

router.post("/resend", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const user = await findByEmail(email);
    if (!user) return res.status(404).json({ error: "No such user" });

    const existing = await getVerification(email);
    const now = new Date();
    let codeToSend;
    if (
      existing &&
      existing.expires_at &&
      new Date(existing.expires_at) > now
    ) {
      return res.status(201).json({
        status: "ok",
        message: "Interruption detected. You can enter the previous code.",
      });
    } else {
      const code = generateCode();
      const expires = new Date(Date.now() + 1000 * 60 * 15).toISOString();
      const row = await upsertVerification(email, code, expires, {
        force: true,
      });
      codeToSend = row.code;
    }

    try {
      await sendVerificationEmail(email, codeToSend);
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

router.post("/verify", async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code)
    return res.status(400).json({ error: "Email and code required" });

  try {
    const row = await getVerification(email);
    if (!row) return res.status(400).json({ error: "No verification pending" });

    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
    if (expiresAt && expiresAt < new Date()) {
      await deleteVerification(email);
      return res.status(400).json({ error: "Code expired" });
    }

    if (String(row.code) !== String(code)) {
      await incAttempts(email);
      return res.status(400).json({ error: "Invalid code" });
    }

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET verified = 1 WHERE email = ?`,
        [email],
        function (err) {
          if (err) return reject(err);
          resolve(this);
        }
      );
    });

    await deleteVerification(email);
    return res.status(200).json({ status: "ok", message: "verified" });
  } catch (err) {
    console.error("verify error:", err);
    return res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/forgot", async (req, res) => {
  const { email } = req.body;
  console.log(req.body);
  if (!email) {
    console.log("Email is required.");
    return res.status(400).json({ error: "Email is required!!" });
  }

  try {
    const user = await findByEmail(email);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const code = generateCode();
    const expires = new Date(Date.now() + 1000 * 60 * 15).toISOString();

    await upsertVerification(email, code, expires, { force: true });

    await sendVerificationEmail(email, code, "reset");
    // generic success message (do not reveal account existence)
    return res.status(200).json({
      status: "ok",
      message: "If the account exists, a reset code was sent to the email.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Failed to send email." });
  }
});

router.patch("/reset", async (req, res) => {
  const { email, code, newPassword } = req.body;
  console.table(req.body);
  if (!email || !code || !newPassword) {
    return res
      .status(400)
      .json({ error: "Email, code and newPassword are required" });
  }

  try {
    const row = await getVerification(email);
    if (!row) return res.status(400).json({ error: "No reset pending" });

    const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
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
