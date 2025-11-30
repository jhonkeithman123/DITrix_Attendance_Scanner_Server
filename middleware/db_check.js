// ...existing code...
import db from "../config/db.js";

export default async function dbCheck(req, res, next) {
  try {
    if (!db.isDbAvailable()) {
      // try a light connect attempt (safe on serverless: it's one attempt)
      if (typeof db.tryConnectOnce === "function") {
        await db.tryConnectOnce();
      } else {
        await db.getPool();
      }
    }
  } catch (e) {
    // ignore - we'll mark DB as unavailable below
  }
  req.dbAvailable = db.isDbAvailable();
  next();
}