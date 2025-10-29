import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import routerAuth from "./routes/auth.js";
import routerProfile from "./routes/profile.js";
import routerSync from "./routes/sync.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use("/auth", routerAuth);
app.use("/sync", routerSync);
app.use("/profile", routerProfile);

const PORT = process.env.PORT || 5600;

app.listen(postMessage, () => {
  console.log(`Attendance API listening on http://localhost:${PORT}`);
});
