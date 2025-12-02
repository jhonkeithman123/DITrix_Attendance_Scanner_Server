import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function toMySqlDatetimeUTC(d: Date): string {
  return new Date(d.getTime()).toISOString().slice(0, 19).replace("T", " ");
}

export function generateToken(profile: {
  id: string | number;
  email: string;
}): string {
  if (process.env.JWT_SECRET) {
    try {
      const payload = { id: profile.id, email: profile.email };
      return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
    } catch (e) {
      console.error("JWT sign error:", e);
      return "fake-jwt-token";
    }
  }
  return "fake-jwt-token";
}

export function parseDbDateUtc(raw?: string | null): Date | null {
  if (!raw) return null;
  let s = String(raw).trim();
  // if already ISO-ish, use directly; otherwise convert "YYYY-MM-DD HH:MM:SS" -> "YYYY-MM-DDTHH:MM:SSZ"
  if (!/[TzZ]/i.test(s)) {
    s = s.replace(" ", "T") + "Z";
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
