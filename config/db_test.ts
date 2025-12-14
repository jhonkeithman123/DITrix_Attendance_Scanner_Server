import db from "../config/db.js";

type ExpectSpec = {
  [table: string]: {
    [col: string]: { accepts: string[]; nullable?: boolean };
  };
};

const expected: ExpectSpec = {
  users: {
    id: { accepts: ["int", "bigint", "mediumint", "varchar"], nullable: false },
    email: { accepts: ["varchar", "text"], nullable: false },
    name: { accepts: ["varchar", "text"], nullable: true },
    avatar_url: { accepts: ["varchar", "text"], nullable: true },
    password_hash: { accepts: ["varchar", "text"], nullable: true },
    verified: { accepts: ["tinyint", "smallint", "int"], nullable: true },
    created_at: { accepts: ["datetime", "timestamp"], nullable: true },
    updated_at: { accepts: ["datetime", "timestamp"], nullable: true },
  },
  sessions: {
    token: { accepts: ["varchar", "text"], nullable: false },
    user_id: { accepts: ["int", "bigint", "varchar"], nullable: true },
    date: { accepts: ["date", "varchar"], nullable: true },
    created_at: { accepts: ["datetime", "timestamp"], nullable: true },
    updated_at: { accepts: ["datetime", "timestamp"], nullable: true },
    expires_at: { accepts: ["datetime", "timestamp"], nullable: true },
  },
  capture_session: {
    id: { accepts: ["varchar", "char"], nullable: false },
    user_id: { accepts: ["varchar", "int", "bigint"], nullable: false },
    subject: { accepts: ["varchar", "text"], nullable: true },
    date: { accepts: ["date", "varchar"], nullable: true },
    start_time: { accepts: ["time", "varchar"], nullable: true },
    end_time: { accepts: ["time", "varchar"], nullable: true },
    created_at: { accepts: ["datetime", "timestamp"], nullable: true },
    updated_at: { accepts: ["datetime", "timestamp"], nullable: true },
  },
  shared_captures: {
    id: { accepts: ["varchar", "char"], nullable: false },
    owner_id: { accepts: ["int", "bigint"], nullable: false },
    share_code: { accepts: ["varchar", "char"], nullable: false },
    subject: { accepts: ["varchar", "text"], nullable: true },
    date: { accepts: ["date", "varchar"], nullable: true },
    start_time: { accepts: ["time", "varchar"], nullable: true },
    end_time: { accepts: ["time", "varchar"], nullable: true },
    created_at: { accepts: ["datetime", "timestamp"], nullable: true },
    updated_at: { accepts: ["datetime", "timestamp"], nullable: true },
  },
  capture_collaborators: {
    capture_id: { accepts: ["varchar", "char"], nullable: false },
    user_id: { accepts: ["int", "bigint"], nullable: false },
    role: { accepts: ["varchar", "enum"], nullable: false },
    joined_at: { accepts: ["datetime", "timestamp"], nullable: true },
  },
  capture_roster: {
    capture_id: { accepts: ["varchar", "char"], nullable: false },
    student_id: { accepts: ["varchar", "char"], nullable: false },
    student_name: { accepts: ["varchar", "text"], nullable: false },
    present: { accepts: ["tinyint", "boolean", "smallint"], nullable: false },
    time_marked: {
      accepts: ["datetime", "timestamp", "varchar"],
      nullable: true,
    },
    status: { accepts: ["varchar", "text"], nullable: true },
  },
};

function normalizeType(t: string) {
  return t.split("(")[0].toLowerCase();
}

async function fetchColumns(table: string) {
  const dbName = process.env.DB_NAME;
  if (!dbName) throw new Error("DB_NAME not set");
  const q = `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_TYPE
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`;
  const pool = await db.getPool();
  if (!pool) throw new Error("DB pool not available");
  const [rows]: any = await pool.query(q, [dbName, table]);
  const map: Record<string, any> = {};
  (rows || []).forEach((r: any) => {
    map[r.COLUMN_NAME] = {
      data_type: normalizeType(r.DATA_TYPE || r.COLUMN_TYPE || ""),
      is_nullable: (r.IS_NULLABLE || "").toUpperCase() === "YES",
      column_type: r.COLUMN_TYPE,
    };
  });
  return map;
}

(async () => {
  try {
    const pool = await db.getPool();
    if (!pool) {
      console.error("DB pool not available. Start DB and try again.");
      process.exit(2);
    }

    console.log("Checking expected tables and columns...\n");
    for (const table of Object.keys(expected)) {
      process.stdout.write(`Table ${table}: `);
      try {
        const cols = await fetchColumns(table);
        if (Object.keys(cols).length === 0) {
          console.log("MISSING");
          continue;
        }
        console.log("FOUND");
        for (const [col, spec] of Object.entries(expected[table])) {
          const have = cols[col];
          if (!have) {
            console.warn(`  - MISSING COLUMN: ${col}`);
            continue;
          }
          const got = have.data_type;
          const ok = spec.accepts.some((a) => got.startsWith(a));
          if (!ok) {
            console.warn(
              `  - TYPE MISMATCH: ${col} expected(${spec.accepts.join(
                "|"
              )}) got(${have.column_type})`
            );
          } else {
            const nullOk =
              spec.nullable === undefined
                ? true
                : spec.nullable === have.is_nullable;
            if (!nullOk) {
              console.warn(
                `  - NULLABILITY MISMATCH: ${col} expected nullable=${spec.nullable} got nullable=${have.is_nullable}`
              );
            } else {
              console.log(
                `  - OK: ${col} (${have.column_type}${
                  have.is_nullable ? ", nullable" : ""
                })`
              );
            }
          }
        }
      } catch (e: any) {
        console.error(` error reading table ${table}:`, e?.message || e);
      }
      console.log("");
    }

    await pool.end();
    console.log("Schema check complete.");
    process.exit(0);
  } catch (e: any) {
    console.error("Schema check failed:", e?.message || e);
    process.exit(1);
  }
})();
