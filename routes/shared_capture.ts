import express, { Request, Response } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  createSharedCapture,
  findSharedCapturesByUser,
  findSharedCaptureById,
  findSharedCaptureByCode,
  addCollaborator,
  removeCollaborator,
  getCollaborators,
  upsertRoster,
  getRoster,
  updateSharedCapture,
  deleteSharedCapture,
  hasAccess,
  captureAlreadyUploaded,
  getAllStudents,
} from "../services/sharedCaptureStoreService.js";
import { findByEmail } from "../services/userStore.js";
import { isDbAvailable } from "../config/firestore.js";

type AuthRequest = Request & {
  user?: { id: string };
};

const router = express.Router();

// All routes require authentication
router.use(authMiddleware);

router
  .route("/")
  // GET /shared-captures - List all captures (owned + shared)
  .get(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable()) return;

    const userId = parseInt(req.user?.id || "0", 10);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const lists = await findSharedCapturesByUser(userId);
      return res.json({
        status: "ok",
        owned: lists.owned,
        shared: lists.shared,
      });
    } catch (e) {
      console.error("[shared-captures] list error:", e);
      return res.status(500).json({ error: "Failed to list captures" });
    }
  })
  // POST /shared-captures - Create new shared capture
  .post(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable()) return;

    const userId = parseInt(req.user?.id || "0", 10);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id, subject, date, start_time, end_time, roster } = req.body || {};
    console.log("[shared-captures/]:");
    console.table(req.body);

    try {
      // Prevent duplicate subject names for the same owner (case insentitive)
      if (subject && typeof subject === "string") {
        const ownedRes = await findSharedCapturesByUser(userId);
        const ownedList = ownedRes?.owned ?? [];
        const normalized = subject.trim().toLowerCase();
        if (
          ownedList.some(
            (c: any) =>
              ((c.subject || "") as string).trim().toLowerCase() === normalized
          )
        ) {
          return res.status(409).json({
            error: "Duplicate subject",
            message: "You already have shared capture with this subject",
          });
        }
      }
      // Check if this capture ID already exists
      const alreadyUploaded = await captureAlreadyUploaded(id);
      if (alreadyUploaded) {
        return res.status(409).json({
          error: "Duplicate upload",
          message: "This capture session has already been uploaded",
        });
      }

      const { captureId, shareCode } = await createSharedCapture(userId, {
        id,
        subject,
        date,
        start_time,
        end_time,
      });

      // If roster provided, insert it
      if (roster && Array.isArray(roster) && roster.length > 0) {
        await upsertRoster(captureId, roster);
      }

      return res.status(201).json({
        status: "ok",
        capture: { id: captureId, share_code: shareCode },
      });
    } catch (e) {
      console.error("[shared-captures] create error:", e);
      return res.status(500).json({ error: "Failed to create capture" });
    }
  });

router
  .route("/:id") // GET /shared-captures/:id - Get single capture with roster
  .get(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable()) return;

    const userId = parseInt(req.user?.id || "0", 10);
    const { id } = req.params;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const access = await hasAccess(userId, id);
      if (!access.hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const capture = await findSharedCaptureById(id);
      if (!capture) {
        return res.status(404).json({ error: "Capture not found" });
      }

      const roster = await getRoster(id);
      const collaborators = await getCollaborators(id);

      return res.json({
        status: "ok",
        capture: { ...capture, roster, collaborators, role: access.role },
      });
    } catch (e) {
      console.error("[shared-captures] get error:", e);
      return res.status(500).json({ error: "Failed to get capture" });
    }
  }) // PATCH /shared-captures/:id - Update capture metadata
  .patch(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable()) return;

    const userId = parseInt(req.user?.id || "0", 10);
    const { id } = req.params;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const access = await hasAccess(userId, id);
      if (!access.hasAccess || access.role === "viewer") {
        return res.status(403).json({ error: "Access denied" });
      }

      const { subject, date, start_time, end_time, roster } = req.body || {};

      await updateSharedCapture(id, { subject, date, start_time, end_time });

      if (roster && Array.isArray(roster)) {
        await upsertRoster(id, roster);
      }

      return res.json({ status: "ok", message: "Capture updated" });
    } catch (e) {
      console.error("[shared-captures] update error:", e);
      return res.status(500).json({ error: "Failed to update capture" });
    }
  })
  .put(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable()) return;
    const userId = parseInt(req.user?.id || "0", 10);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id } = req.params;
    const body = req.body || {};
    try {
      const access = await hasAccess(userId, id);
      if (!access?.hasAccess)
        return res.status(403).json({ error: "Forbidden" });

      // If client attempts to change subject/start_time/end_time, ensure role is owner or editor.
      const tryingToChangeMetadata =
        Object.prototype.hasOwnProperty.call(body, "subject") ||
        Object.prototype.hasOwnProperty.call(body, "start_time") ||
        Object.prototype.hasOwnProperty.call(body, "end_time") ||
        Object.prototype.hasOwnProperty.call(body, "date");

      if (
        tryingToChangeMetadata &&
        access.role !== "owner" &&
        access.role !== "editor"
      ) {
        return res
          .status(403)
          .json({ error: "Only owner or co-owner may change subject/time" });
      }

      const updated = await updateSharedCapture(id, {
        subject: body.subject,
        date: body.date,
        start_time: body.start_time,
        end_time: body.end_time,
      });

      // update roster separately if provided
      if (body.roster && Array.isArray(body.roster)) {
        await upsertRoster(id, body.roster);
      }

      return res.json({ status: "ok", capture: updated });
    } catch (e) {
      console.error("[shared-captures] update error:", e);
      return res.status(500).json({ error: "Failed to update capture" });
    }
  }) // DELETE /shared-captures/:id - Delete capture
  .delete(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable()) return;

    const userId = parseInt(req.user?.id || "0", 10);
    const { id } = req.params;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const access = await hasAccess(userId, id);
      if (!access.hasAccess || access.role !== "owner") {
        return res.status(403).json({ error: "Only owner can delete" });
      }

      await deleteSharedCapture(id);
      return res.json({ status: "ok", message: "Capture deleted" });
    } catch (e) {
      console.error("[shared-captures] delete error:", e);
      return res.status(500).json({ error: "Failed to delete capture" });
    }
  });

// POST /shared-captures/:id/join - Join by share code
router.post("/join/:code", async (req: AuthRequest, res: Response) => {
  if (!isDbAvailable()) return;

  const userId = parseInt(req.user?.id || "0", 10);
  const { code } = req.params;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const capture = await findSharedCaptureByCode(code);
    if (!capture) {
      return res.status(404).json({ error: "Invalid share code" });
    }

    // Check if already has access
    const access = await hasAccess(userId, capture.id);
    if (access.hasAccess) {
      return res.json({
        status: "ok",
        message: "Already have access",
        capture_id: capture.id,
      });
    }

    await addCollaborator(capture.id, userId, "viewer");

    return res.json({
      status: "ok",
      message: "Joined successfully",
      capture_id: capture.id,
    });
  } catch (e) {
    console.error("[shared-captures] join error:", e);
    return res.status(500).json({ error: "Failed to join capture" });
  }
});

// POST /shared-captures/:id/collaborators - Add collaborator by email
router.post("/:id/collaborators", async (req: AuthRequest, res: Response) => {
  if (!isDbAvailable()) return;

  const userId = parseInt(req.user?.id || "0", 10);
  const { id } = req.params;
  const { email, role } = req.body || {};

  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const access = await hasAccess(userId, id);
    // allow owner OR editor (co-owner) to invite collaborators
    if (
      !access.hasAccess ||
      (access.role !== "owner" && access.role !== "editor")
    ) {
      return res.status(403).json({
        error: "Only owner or co-owner (editor) can add collaborators",
      });
    }

    const user = await findByEmail(email);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await addCollaborator(id, parseInt(String(user.id)), role || "viewer");

    return res.json({ status: "ok", message: "Collaborator added" });
  } catch (e) {
    console.error("[shared-captures] add collaborator error:", e);
    return res.status(500).json({ error: "Failed to add collaborator" });
  }
});

// GET /shared-captures/students/list - Get all students for invitation
router.get("/students/list", async (req: AuthRequest, res: Response) => {
  if (!isDbAvailable()) return;

  const userId = parseInt(req.user?.id || "0", 10);
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const students = await getAllStudents();
    return res.json({ status: "ok", students });
  } catch (e) {
    console.error("[shared-captures] get students error:", e);
    return res.status(500).json({ error: "Failed to get students" });
  }
});

// DELETE /shared-captures/:id/collaborators/:userId - Remove collaborator
router.delete(
  "/:id/collaborators/:collabId",
  async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable()) return;

    const userId = parseInt(req.user?.id || "0", 10);
    const { id, collabId } = req.params;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const access = await hasAccess(userId, id);
      if (!access.hasAccess || access.role !== "owner") {
        return res
          .status(403)
          .json({ error: "Only owner can remove collaborators" });
      }

      await removeCollaborator(id, parseInt(collabId, 10));

      return res.json({ status: "ok", message: "Collaborator removed" });
    } catch (e) {
      console.error("[shared-captures] remove collaborator error:", e);
      return res.status(500).json({ error: "Failed to remove collaborator" });
    }
  }
);

export default router;
