import nodemailer, { Transporter } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import dotenv from "dotenv";

dotenv.config();

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL =
  process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER;
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "DITrix";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT
  ? Number(process.env.SMTP_PORT)
  : undefined;
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS;
const USE_SMTP_FALLBACK = !BREVO_API_KEY && SMTP_USER && SMTP_PASS;
let smtpTransporter: Transporter | null = null;
if (USE_SMTP_FALLBACK) {
  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT || 587,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 15000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 15000),
    pool: process.env.SMTP_POOL === "true" || false,
  } as SMTPTransport.Options);

  smtpTransporter
    .verify()
    .then(() =>
      console.log(`SMTP mailer ready (host=${SMTP_HOST}, port=${SMTP_PORT})`)
    )
    .catch((err) =>
      console.warn(
        "SMTP verify failed — SMTP fallback may not work:",
        err?.message
      )
    );
}

type BrevoResponse = Record<string, any> | null;
type EmailType = "verify" | "reset";

async function sendViaBrevo(
  to: string,
  code: string,
  type: EmailType = "verify"
): Promise<BrevoResponse> {
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY not configured");

  const url = "https://api.brevo.com/v3/smtp/email";
  const subject =
    type === "reset"
      ? "DITrix password reset code"
      : "DITrix email verification code";
  const htmlContent = `
    <div style="font-family:Arial,sans-serif;color:#111">
      <h3>DITrix — Email verification</h3>
      <p>Your verification code is:</p>
      <p style="font-size:20px;font-weight:700">${code}</p>
      <p>If you did not request this, you can ignore this message.</p>
    </div>
  `;

  const payload = {
    sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
    to: [{ email: to }],
    subject,
    htmlContent,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const e: any = new Error(`Brevo send failed (${res.status}): ${text}`);
    e.status = res.status;
    throw e;
  }

  const json = await res.json().catch(() => null);
  console.log("Brevo send succeeded", json?.messageId || "(no id)");
  return json;
}

export async function sendVerificationEmail(
  to: string,
  code: string,
  type: EmailType = "verify"
): Promise<any> {
  // prefer Brevo HTTP API
  if (BREVO_API_KEY) {
    try {
      return await sendViaBrevo(to, code, type);
    } catch (err: any) {
      console.warn(
        "Brevo send failed, falling back to SMTP if configured:",
        err?.message || err
      );
      if (!USE_SMTP_FALLBACK) throw err;
    }
  }

  if (!smtpTransporter) {
    throw new Error(
      "No mail transport available (set BREVO_API_KEY or SMTP_* env vars)"
    );
  }

  const subject =
    type === "reset"
      ? "DITrix password reset code"
      : "DITrix email verification code";
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111">
        <h3>DITrix — Email verification</h3>
        <p>Your verification code is:</p>
        <p style="font-size:20px;font-weight:700">${code}</p>
        <p>If you did not request this, you can ignore this message.</p>
    </div>
  `;

  try {
    const info = await smtpTransporter.sendMail({
      from: `"${BREVO_SENDER_NAME}" <${BREVO_SENDER_EMAIL}>`,
      to,
      subject,
      html,
    });
    console.log("SMTP verification email sent:", info?.messageId || info);
    return info;
  } catch (err: any) {
    console.error("SMTP send failed:", err?.message || err);
    throw err;
  }
}
