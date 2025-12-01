// ...existing code...
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initUsers } from "./config/db.js";
import { initSessions } from "./services/sessionStore.js";

import restrictBrowseRoute from "./routes/browser_restrict.js";
import routerAuth from "./routes/auth.js";
import routerProfile from "./routes/profile.js";
import routerSync from "./routes/sync.js";
import health from "./routes/health.js";

import dbCheck from "./middleware/db_check.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// per-request DB availability check
app.use(dbCheck);

app.use("/", restrictBrowseRoute);
app.use("/auth", routerAuth);
app.use("/sync", routerSync);
app.use("/profile", routerProfile);
app.use("/health", health);

async function tryInitDb({
  maxRetries = Infinity,
  initialDelayMs = 2000,
  maxDelayMs = 30_000,
} = {}) {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    attempt++;
    try {
      console.log(`DB init attempt #${attempt}...`);
      await initUsers();
      await initSessions();
      console.log("DB initialized successfully.");
      return true;
    } catch (err) {
      console.warn(`DB init attempt #${attempt} failed:`, err?.message || err);
      const jitter = Math.floor(Math.random() * 1000);
      const waitMs = Math.min(delay + jitter, maxDelayMs);
      console.log(`Retrying DB init in ${Math.round(waitMs / 1000)}s...`);
      await new Promise((r) => setTimeout(r, waitMs));
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }

  console.error("Exceeded DB init retries.");
  return false;
}

// export app so serverless platforms (Vercel) can import it as a handler
export default app;

const IS_SERVERLESS = process.env.VERCEL === "1" || process.env.IS_SERVERLESS === "true";

if (!IS_SERVERLESS) {
  // start long-running server and background DB init
  async function start() {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () =>
      console.log(`Server listening on http://localhost:${PORT}`)
    );

    // non-blocking background DB init + retry (only for long-running hosts)
    tryInitDb().catch((e) =>
      console.error("Background DB init encountered an error:", e)
    );
  }

  start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
} else {
  console.log("Serverless mode: app exported for platform (no listen(), no background loops).");
}