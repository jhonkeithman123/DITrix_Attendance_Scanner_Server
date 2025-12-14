import dbMy from "../config/db";
import dbFs, { admin } from "../config/firestore";

async function copyTable(
  table: string,
  collName: string,
  transform?: (row: any) => any
) {
  const pool = await dbMy.getPool();
  if (!pool) throw new Error("MySQL pool not available");
  const [rows]: any = await pool.query(`SELECT * FROM \`${table}\``);
  console.log(`Migrating ${rows.length} rows from ${table} -> ${collName}`);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const batch = dbFs.batch();
    chunk.forEach((r: any) => {
      const id = r.id ?? r.token ?? dbFs.collection(collName).doc().id;
      const docRef = dbFs.collection(collName).doc(String(id));
      const payload = transform ? transform(r) : r;
      batch.set(docRef, payload, { merge: true });
    });
    await batch.commit();
  }
}

async function migrate() {
  // users
  await copyTable("users", "users", (r) => ({
    id: String(r.id),
    email: r.email,
    name: r.name || null,
    avatar_url: r.avatar_url || null,
    verified: !!r.verified,
    created_at: r.created_at
      ? admin.firestore.Timestamp.fromDate(new Date(r.created_at))
      : null,
    updated_at: r.updated_at
      ? admin.firestore.Timestamp.fromDate(new Date(r.updated_at))
      : null,
  }));

  // sessions
  await copyTable("sessions", "sessions", (r) => ({
    token: r.token,
    user_id: r.user_id ? String(r.user_id) : null,
    date: r.date ? String(r.date) : null,
    created_at: r.created_at
      ? admin.firestore.Timestamp.fromDate(new Date(r.created_at))
      : null,
    updated_at: r.updated_at
      ? admin.firestore.Timestamp.fromDate(new Date(r.updated_at))
      : null,
    expires_at: r.expires_at
      ? admin.firestore.Timestamp.fromDate(new Date(r.expires_at))
      : null,
  }));

  // capture_session
  await copyTable("capture_session", "capture_sessions", (r) => ({
    id: String(r.id),
    user_id: String(r.user_id),
    subject: r.subject || null,
    date: r.date || null,
    start_time: r.start_time || null,
    end_time: r.end_time || null,
    created_at: r.created_at
      ? admin.firestore.Timestamp.fromDate(new Date(r.created_at))
      : null,
    updated_at: r.updated_at
      ? admin.firestore.Timestamp.fromDate(new Date(r.updated_at))
      : null,
  }));

  // shared_captures
  await copyTable("shared_captures", "shared_captures", (r) => ({
    id: String(r.id),
    owner_id: String(r.owner_id),
    share_code: r.share_code,
    subject: r.subject || null,
    date: r.date || null,
    start_time: r.start_time || null,
    end_time: r.end_time || null,
    created_at: r.created_at
      ? admin.firestore.Timestamp.fromDate(new Date(r.created_at))
      : null,
    updated_at: r.updated_at
      ? admin.firestore.Timestamp.fromDate(new Date(r.updated_at))
      : null,
  }));

  // roster -> subcollections
  const pool = await dbMy.getPool();
  const [rosters]: any = await pool?.query("SELECT * FROM capture_roster");
  const byCapture: Record<string, any[]> = {};
  rosters.forEach((r: any) => {
    const cid = String(r.capture_id);
    byCapture[cid] = byCapture[cid] || [];
    byCapture[cid].push(r);
  });
  for (const [cid, rows] of Object.entries(byCapture)) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const batch = dbFs.batch();
      chunk.forEach((r: any) => {
        const docRef = dbFs
          .collection("shared_captures")
          .doc(cid)
          .collection("roster")
          .doc(String(r.student_id));
        batch.set(
          docRef,
          {
            student_id: String(r.student_id),
            student_name: r.student_name,
            present: !!r.present,
            time_marked: r.time_marked
              ? admin.firestore.Timestamp.fromDate(new Date(r.time_marked))
              : null,
            status: r.status || null,
          },
          { merge: true }
        );
      });
      await batch.commit();
    }
  }

  // collaborators -> subcollections
  const [colls]: any = await pool?.query("SELECT * FROM capture_collaborators");
  const collByCapture: Record<string, any[]> = {};
  colls.forEach((r: any) => {
    const cid = String(r.capture_id);
    collByCapture[cid] = collByCapture[cid] || [];
    collByCapture[cid].push(r);
  });
  for (const [cid, rows] of Object.entries(collByCapture)) {
    const batch = dbFs.batch();
    rows.forEach((r: any) => {
      const docRef = dbFs
        .collection("shared_captures")
        .doc(cid)
        .collection("collaborators")
        .doc(String(r.user_id));
      batch.set(
        docRef,
        {
          user_id: String(r.user_id),
          role: r.role,
          joined_at: r.joined_at
            ? admin.firestore.Timestamp.fromDate(new Date(r.joined_at))
            : null,
        },
        { merge: true }
      );
    });
    await batch.commit();
  }

  console.log("Migration complete.");
  process.exit(0);
}

migrate().catch((e) => {
  console.error("Migration error:", e);
  process.exit(1);
});
