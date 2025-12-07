import express, { Request, Response } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { findById, updateProfileById } from "../services/userStore.js";
import db from "../config/db.js";
import { DBAvailable } from "../middleware/db_check.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

type AuthRequest = Request & {
  user?: { id: string };
};

// ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "avatars");
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
} catch (e) {
  console.warn("Could not create upload dir:", e);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const name = `${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}${ext}`;
    cb(null, name);
  },
});
const uplaod = multer({ storage });

router
  .route("/")
  .all(authMiddleware)
  // GET /profile -> return current user's profile
  .get(async (req: AuthRequest, res: Response) => {
    if (!DBAvailable(req, res)) return;

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
  .put(uplaod.single("avatar"), async (req: AuthRequest, res: Response) => {
    if (!DBAvailable(req, res)) return;

    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: "Unauthorized" });

      const { name } = req.body || {};
      let avatar_url: string | undefined;

      // 1) If a multipart file was uploaded, save and return a public URL
      if (req.file) {
        // build an absolute URL that the client can use to fetch the image
        const host = req.get("host");
        const protocol = req.protocol;
        avatar_url = `${protocol}://${host}/uploads/avatars/${req.file.filename}`;
      } else {
        // 2) If avatarBase64 is provided (data URL or plain base64), save to disk and return URL
        const avatarBase64 =
          (req.body && (req.body.avatarBase64 || req.body.avatar)) || undefined;
        if (avatarBase64 && typeof avatarBase64 === "string") {
          // If it's a remote URL already, just keep it
          if (
            avatarBase64.startsWith("http://") ||
            avatarBase64.startsWith("https://")
          ) {
            avatar_url = avatarBase64;
          } else {
            // try parse data:<mime>;base64,xxxx or plain base64
            let matches = avatarBase64.match(
              /^data:(image\/[a-zA-Z]+);base64,(.+)$/
            );
            let mime = "image/jpeg";
            let b64 = avatarBase64;
            if (matches) {
              mime = matches[1];
              b64 = matches[2];
            }
            // try decode
            try {
              const buffer = Buffer.from(b64, "base64");
              const ext = mime.split("/")[1] || "jpg";
              const filename = `${Date.now()}_${Math.random()
                .toString(36)
                .slice(2, 8)}.${ext}`;
              const filepath = path.join(UPLOAD_DIR, filename);
              fs.writeFileSync(filepath, buffer);
              const host = req.get("host");
              const protocol = req.protocol;
              avatar_url = `${protocol}://${host}/uploads/avatars/${filename}`;
            } catch (e) {
              console.warn("Failed to parse avatarBase64:", e);
            }
          }
        }
      }

      const updated = await updateProfileById(userId, { name, avatar_url });
      if (!updated) return res.status(400).json({ error: "Nothing to update" });
      return res.json({ status: "ok", profile: updated });
    } catch (e) {
      console.error("profile update error:", e);
      return res.status(500).json({ error: "Failed to update profile" });
    }
  });

export default router;
