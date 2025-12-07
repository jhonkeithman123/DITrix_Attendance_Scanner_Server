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

// --- Add request logging to help debug raw-body / body-parser issues ---
app.use((req: Request, _res: Response, next: NextFunction) => {
  try {
    const ct = (req.headers["content-type"] || "").toString();
    const cl = (req.headers["content-length"] || "").toString();
    console.log(
      `[REQ] ${req.method} ${req.originalUrl} content-type=${ct} content-length=${cl}`
    );
  } catch (e) {
    console.log("[REQ] logger error", e);
  }
  next();
});

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

// --- Error handler that logs body-parser / raw-body errors for diagnosis ---
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // Log full error and some request meta for debugging
  try {
    console.error("[ERROR] uncaught middleware error:", {
      message: err?.message,
      type: err?.type,
      stack: err?.stack,
      url: req.originalUrl,
      method: req.method,
      contentType: req.headers["content-type"],
      contentLength: req.headers["content-length"],
    });
  } catch (logErr) {
    console.error("[ERROR] logging failed", logErr);
  }

  // Handle common body-parser/raw-body errors
  if (
    err &&
    (err.type === "entity.too.large" ||
      /entity.*too.*large/i.test(err.message || ""))
  ) {
    return res.status(413).json({ error: "Payload too large" });
  }
  if (
    err &&
    (err.message?.includes("raw-body") ||
      err.message?.includes("Unexpected end of"))
  ) {
    return res
      .status(400)
      .json({
        error: "Invalid request payload (raw-body)",
        detail: err.message,
      });
  }

  // fallback
  return res
    .status(err?.status || 500)
    .json({ error: err?.message ?? "Server error" });
});

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
