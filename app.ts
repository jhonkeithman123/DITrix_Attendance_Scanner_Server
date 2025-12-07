// ...existing code...
import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";

import restrictBrowseRoute from "./routes/browser_restrict.js";
import routerAuth from "./routes/auth.js";
import routerProfile from "./routes/profile.js";
import routerSync from "./routes/sync.js";
import health from "./routes/health.js";
import routerSharedCaptures from "./routes/shared_capture.js";
import dbCheck from "./middleware/db_check.js";

dotenv.config();
const app: Express = express();
app.use(cors());
app.use(express.json());

// per-request DB availability check
app.use(dbCheck);

app.use((req: Request, res: Response, next: NextFunction) => {
  const ct = (req.headers["content-type"] || "").toString();
  // If multipart form (file upload), skip json/body parsing so multer can consume the stream
  if (ct.startsWith("multipart/form-data")) {
    return next();
  }
  // For all other request types, parse JSON with higher limits
  express.json({ limit: "20mb" })(req, res, (err) => {
    if (err) return next(err);
    next();
  });
});

// Keep url encoded for forms (also with larger limit)
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Serve upload avatars
app.use(
  "/uploads/avatars",
  express.static(path.join(process.cwd(), "public", "uploads", "avatars"))
);

app.use("/", restrictBrowseRoute);
app.use("/auth", routerAuth);
app.use("/sync", routerSync);
app.use("/profile", routerProfile);
app.use("/health", health);
app.use("/shared-captures", routerSharedCaptures);

const IS_SERVERLESS =
  process.env.VERCEL === "1" || process.env.IS_SERVERLESS === "true";

if (!IS_SERVERLESS) {
  // start long-running server and background DB init
  async function start(): Promise<void> {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () =>
      console.log(`Server listening on http://localhost:${PORT}`)
    );
  }

  start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
} else {
  console.log(
    "Serverless mode: app exported for platform (no listen(), no background loops)."
  );
}

export default app;
