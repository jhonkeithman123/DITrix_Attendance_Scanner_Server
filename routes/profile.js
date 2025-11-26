import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { findById, updateProfileById } from "../services/userStore.js";

const router = express.Router();

// GET /profile -> return current user's profile
router.get("/", authMiddleware, async (req, res) => {
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
});

// PUT /profile -> update name/avatar (body: { name, avatarBase64 })
router.put("/", authMiddleware, async (req, res) => {
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
