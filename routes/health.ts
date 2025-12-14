import express, { Request, Response } from "express";
import { isDbAvailable } from "../config/firestore";
const router = express.Router();

router.get("/", (req: Request, res: Response) => {
  if (isDbAvailable()) return res.status(200).json({ ok: true, db: true });
  return res.status(503).json({ ok: false, db: false });
});

export default router;
