import express from "express";

const router = express.Router();

router.get("/profile", (req, res) => {
  // TODO: validate token and return stored profile
  return res.json({
    name: "Test User",
    email: "test@example.com",
    avatar_url: "",
  });
});

export default router;
