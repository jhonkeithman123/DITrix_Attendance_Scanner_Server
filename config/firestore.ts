import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

if (!admin.apps.length) {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath)
    throw new Error(
      "Set GOOGLE_APPLICATION_CREDENTIALS to service account JSON"
    );
  admin.initializeApp({
    credential: admin.credential.cert(require(credPath)),
  });
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

export { admin };
export default db;
