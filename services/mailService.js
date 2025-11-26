import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

if (!user || !pass) {
  console.warn(
    "Mailer not configured: set EMAIL_USER and EMAIL_PASS in .env file"
  );
}

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user, pass },
});

export async function sendVerificationEmail(to, code, type = "verify") {
  if (!user || !pass) throw new Error("Mailer not configured");

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

  const info = await transporter.sendMail({
    from: `"DITrix" <${user}>`,
    to,
    subject,
    html,
  });

  return info;
}
