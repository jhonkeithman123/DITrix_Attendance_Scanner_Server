import express, { Request, Response } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  upsertCapturesForUser,
  findCaptureByUser,
} from "../services/captureSessionStore.js";
import db from "../config/db.js";
import { v4 as uuidv4 } from "uuid";
import { DBAvailable } from "../middleware/db_check.js";

type AuthRequest = Request & {
  user?: { id: string };
};

const router = express.Router();

// body: { captures: [ { capture_id, subject, date, start_time, end_time } ] }

router
  .route("/captures")
  .all(authMiddleware)
  // GET /sync/captures -> list captures for authenticated user
  .get(async (req: AuthRequest, res: Response) => {
    if (!DBAvailable(req, res)) return;

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    try {
      const rows = await findCaptureByUser(userId);
      return res.json({ status: "ok", captures: rows });
    } catch (e) {
      console.error("list captures error:", e);
      return res.status(500).json({ error: "Failed to list captures" });
    }
  })
  // POST /sync/captures
  .post(async (req: AuthRequest, res: Response) => {
    if (!DBAvailable(req, res)) return;

    const raw = req.body?.captures;
    const captures = Array.isArray(raw) ? raw : [];

    if (captures.length === 0)
      return res.status(400).json({ error: "No captures provided" });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const normalized = captures.map((c: any) => {
      const id = c?.capture_id ?? c?.id ?? uuidv4();

      return {
        capture_id: String(id),
        subject: c?.subject ?? null,
        date: c?.date ?? null,
        start_time: c?.start_time ?? null,
        end_time: c?.end_time ?? null,
      };
    });

    try {
      const uploaded = await upsertCapturesForUser(userId, normalized);
      return res.json({ status: "ok", uploaded });
    } catch (e: any) {
      console.error("sync captures error:", e);

      // MySQL foriegn key errors - explicit and helpful
      const msg = (e && (e.message || e.sqlMessage || "")).toString();
      const code = e && e.code;

      if (
        code === "ER_NO_REFERENCE_ROW_2" ||
        code === "ER_NO_REFERENCE_ROW" ||
        msg.toLowerCase().includes("foreign key") ||
        msg.toLowerCase().includes("referenced")
      ) {
        return res
          .status(400)
          .json({ error: "Invalid user id for capture (foreign key failed)" });
      }

      return res.status(500).json({ error: "Failed to upload captures" });
    }
  });

export default router;
