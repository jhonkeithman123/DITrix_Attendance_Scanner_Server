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
    if (!isDbAvailable())
      return res.status(503).json({ error: "Database unavailable" });

    const userId = req.user?.id;
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
    if (!isDbAvailable())
      return res.status(503).json({ error: "Database unavailable" });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { id, subject, date, start_time, end_time, roster } = req.body || {};

    try {
      // Prevent duplicate subject names for the same owner (case insentitive)
      if (await captureAlreadyUploaded(id)) {
        return res
          .status(409)
          .json({ error: "Capture already uploaded for this session" });
      }

      const created = await createSharedCapture(userId, {
        id,
        subject,
        date,
        start_time,
        end_time,
      });

      if (Array.isArray(roster) && roster.length > 0) {
        await upsertRoster(created.captureId, roster);
      }

      return res.status(201).json({
        status: "ok",
        captureId: created.captureId,
        shareCode: created.shareCode,
      });
    } catch (e) {
      console.error("[shared-captures] create error:", e);
      return res.status(500).json({ error: "Failed to create capture" });
    }
  });

router
  .route("/:id") // GET /shared-captures/:id - Get single capture with roster
  .get(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable())
      return res.status(503).json({ error: "Database unavailable" });

    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const access = await hasAccess(userId, id);
      if (!access.hasAccess) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const capture = await findSharedCaptureById(id);
      if (!capture) return res.status(404).json({ error: "Not found" });

      const roster = await getRoster(id);
      const collaborators = await getCollaborators(id);

      const rosterForClient = roster.map((r) => ({
        id: r.student_id,
        name: r.student_name,
        present: r.present,
        time: r.time_marked,
        status: r.status,
      }));

      // Sorting by name alphabetically
      rosterForClient.sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, {
          senstivity: "base",
        })
      );

      return res.json({
        status: "ok",
        capture: {
          ...capture,
          roster: rosterForClient,
          collaborators,
          role: access.role ?? "viewer",
        },
      });
    } catch (e) {
      console.error("[shared-captures] get error:", e);
      return res.status(500).json({ error: "Failed to get capture" });
    }
  }) // PATCH /shared-captures/:id - Update capture metadata
  .patch(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable())
      return res.status(503).json({ error: "Database unavailable" });

    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { subject, date, start_time, end_time, roster } = req.body || {};
    try {
      const access = await hasAccess(userId, id);
      if (!access.hasAccess) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const updates: any = {};
      if (subject !== undefined) updates.subject = subject;
      if (date !== undefined) updates.date = date;
      if (start_time !== undefined) updates.start_time = start_time;
      if (end_time !== undefined) updates.end_time = end_time;

      const updated = await updateSharedCapture(id, {
        subject,
        date,
        start_time,
        end_time,
      });

      if (Array.isArray(roster)) {
        await upsertRoster(id, roster);
      }

      const newRoster = await getRoster(id);
      const rosterForClient = newRoster.map((r) => ({
        id: r.student_id,
        name: r.student_name,
        present: r.present,
        time: r.time_marked,
        status: r.status,
      }));

      return res.json({
        status: "ok",
        message: "Capture updated",
        capture: {
          ...updated,
          role: access.role ?? "viewer",
          roster: rosterForClient,
        },
      });
    } catch (e) {
      console.error("[shared-captures] update error:", e);
      return res.status(500).json({ error: "Failed to update capture" });
    }
  })
  .put(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable())
      return res.status(503).json({ error: "Database unavailable" });

    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const access = await hasAccess(userId, id);
      if (!access?.hasAccess || access.role !== "owner") {
        return res.status(403).json({ error: "Only owner can delete" });
      }

      await deleteSharedCapture(id);
      return res.json({ status: "ok" });
    } catch (e) {
      console.error("[shared-captures] update error:", e);
      return res.status(500).json({ error: "Failed to update capture" });
    }
  }) // DELETE /shared-captures/:id - Delete capture
  .delete(async (req: AuthRequest, res: Response) => {
    if (!isDbAvailable())
      return res.status(503).json({ error: "Database unavailable" });

    const userId = req.user?.id;
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
  if (!isDbAvailable())
    return res.status(503).json({ error: "Database unavailable" });

  const userId = req.user?.id;
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
  if (!isDbAvailable())
    return res.status(503).json({ error: "Database unavailable" });

  const userId = req.user?.id;
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

    await addCollaborator(id, userId, role || "viewer");

    return res.json({ status: "ok", message: "Collaborator added" });
  } catch (e) {
    console.error("[shared-captures] add collaborator error:", e);
    return res.status(500).json({ error: "Failed to add collaborator" });
  }
});

// GET /shared-captures/students/list - Get all students for invitation
router.get("/students/list", async (req: AuthRequest, res: Response) => {
  if (!isDbAvailable())
    return res.status(503).json({ error: "Database unavailable" });

  const userId = req.user?.id;
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
    if (!isDbAvailable())
      return res.status(503).json({ error: "Database unavailable" });

    const userId = req.user?.id;
    const { id, collabId } = req.params;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    try {
      const access = await hasAccess(userId, id);
      if (!access.hasAccess || access.role !== "owner") {
        return res
          .status(403)
          .json({ error: "Only owner can remove collaborators" });
      }

      await removeCollaborator(id, collabId);

      return res.json({ status: "ok", message: "Collaborator removed" });
    } catch (e) {
      console.error("[shared-captures] remove collaborator error:", e);
      return res.status(500).json({ error: "Failed to remove collaborator" });
    }
  }
);

export default router;
