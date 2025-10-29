import express from "express";

const router = express.Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  // TODO: do later
  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  return res.json({
    token: "fake-jwt-token",
    profile: { name: "Test User", email, avatar_url: "" },
  });
});

router.post("/signup", (req, res) => {
  // TODO: create user later
  return res.json({ status: "ok" });
});

export default router;
