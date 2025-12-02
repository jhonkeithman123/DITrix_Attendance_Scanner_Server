import express, { Request, Response } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { findById, updateProfileById } from "../services/userStore.js";
import db from "../config/db.js";

const router = express.Router();

type AuthRequest = Request & {
  user?: { id: string };
};

router
  .route("/")
  .all(authMiddleware)
  // GET /profile -> return current user's profile
  .get(async (req: AuthRequest, res: Response) => {
    if (!req.dbAvailable && !db.isDbAvailable()) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const profile = await findById(userId);
      if (!profile) return res.status(404).json({ error: "User not found" });

      return res.json({ status: "ok", profile });
    } catch (e) {
      console.error("profile get error:", e);
      return res.status(500).json({ error: "Failed to get profile" });
    }
  })
  // PUT /profile -> update name/avatar (body: { name, avatarBase64 })
  .put(async (req: AuthRequest, res: Response) => {
    if (!req.dbAvailable && !db.isDbAvailable()) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { name, avatarBase64 } = req.body || {};
      const avatar_url = avatarBase64 ?? undefined;
      const updated = await updateProfileById(userId, { name, avatar_url });
      if (!updated) return res.status(400).json({ error: "Nothing to update" });

      return res.json({ statis: "ok", profile: updated });
    } catch (e) {
      console.error("profile update error:", e);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  });

export default router;
