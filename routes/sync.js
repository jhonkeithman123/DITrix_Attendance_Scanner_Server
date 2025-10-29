import express from "express";

const router = express.Router();

router.post("/sync", (req, res) => {
  const payload = req.body;
  if (!payload) return res.status(400).json({ error: "bad payload" });
  // TODO: persist payload (DB)
  return res.json({ status: "synced" });
});

export default router;
