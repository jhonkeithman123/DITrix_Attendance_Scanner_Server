import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { initUsers } from "./config/db.js";
import { initSessions } from "./services/sessionStore.js";

import restrictBrowseRoute from "./routes/browser_restrict.js";
import routerAuth from "./routes/auth.js";
import routerProfile from "./routes/profile.js";
import routerSync from "./routes/sync.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use("/", restrictBrowseRoute);
app.use("/auth", routerAuth);
app.use("/sync", routerSync);
app.use("/profile", routerProfile);

async function start() {
  await initUsers();
  await initSessions();
  const PORT = process.env.PORT || 5600;
  const HOST = process.env.HOST || "0.0.0.0";
  const ip = process.env.IP_ADDRESS || "192.168.1.3";
  app.listen(PORT, HOST, () =>
    console.log(`Server listening on http://${ip}:${PORT}`)
  );
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
