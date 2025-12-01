import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  upsertCapturesForUser,
  findCaptureByUser,
} from "../services/captureSessionStore.js";

const router = express.Router();

// POST /sync/captures
// body: { captures: [ { capture_id, subject, date, start_time, end_time } ] }
router.post("/captures", authMiddleware, async (req, res) => {
  const captures = Array.isArray(req.body?.captures) ? req.body.captures : [];
  if (captures.length === 0)
    return res.status(400).json({ error: "No captures provided" });
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const uploaded = await upsertCapturesForUser(userId, captures);
    return res.json({ status: "ok", uploaded });
  } catch (e) {
    console.error("sync captures error:", e);
    // give helpful FK error if present
    if (e && e.message && e.message.includes("FOREIGN KEY")) {
      return res
        .status(400)
        .json({ error: "Invalid user id for capture (foreign key failed)" });
    }
    return res.status(500).json({ error: "Failed to upload captures" });
  }
});

// GET /sync/captures -> list captures for authenticated user
router.get("/captures", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const rows = await findCaptureByUser(userId);
    return res.json({ status: "ok", captures: rows });
  } catch (e) {
    console.error("list captures error:", e);
    return res.status(500).json({ error: "Failed to list captures" });
  }
});

export default router;
