// ...existing code...
import { Request, Response, NextFunction } from "express";
import db from "../config/db.js";

export default async function dbCheck(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!db.isDbAvailable()) {
      // try a light connect attempt (safe on serverless: it's one attempt)
      if (typeof (db as any).tryConnectOnce === "function") {
        await (db as any).tryConnectOnce();
      } else {
        await (db as any).getPool();
      }
    }
  } catch (e) {
    // ignore - we'll mark DB as unavailable below
  }
  req.dbAvailable = db.isDbAvailable();
  next();
}
