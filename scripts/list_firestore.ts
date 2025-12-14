import db from "../config/firestore.js";
(async () => {
  const colNames = await db.listCollections();
  console.log("Top-level-collection:");
  for (const c of colNames) console.log(" -", c.id);
  process.exit(0);
})();
