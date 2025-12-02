// ...existing code...
import dotenv from "dotenv";
import EventEmitter from "events";
import type {
  Pool,
  PoolOptions,
  RowDataPacket,
  FieldPacket,
} from "mysql2/promise";

dotenv.config();

const {
  DB_RETRY_ATTEMPTS = 0, // 0 = retry forever
  DB_RETRY_BACKOFF_MS = 2000,
  SKIP_DB_ON_START = "false",
  DB_SSL = "false",
  DB_SSL_REJECT_UNAUTHORIZED = "false",
} = process.env;

const IS_SERVERLESS =
  process.env.VERCEL === "1" || process.env.IS_SERVERLESS === "true";

const eventBus = new EventEmitter();
let pool: Pool | null = null;
let connecting = false;
let attempts = 0;

function isDbAvailable(): boolean {
  return !!pool;
}

async function tryConnectOnce(): Promise<boolean> {
  try {
    const mysql = await import("mysql2/promise");

    const poolOptions: PoolOptions = {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONN_LIMIT || 2), // <-- lowered for serverless
      queueLimit: 0,
      connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
    };

    if (DB_SSL === "true" || DB_SSL === "1") {
      // @ts-ignore - mysql2 PoolOptions.ssl accepts a variety of shapes
      poolOptions.ssl = {
        rejectUnauthorized: DB_SSL_REJECT_UNAUTHORIZED === "true",
      };
    } else {
      // @ts-ignore
      poolOptions.ssl = false;
    }

    pool = mysql.createPool(poolOptions) as Pool;

    await pool.query("SELECT 1");
    attempts = 0;
    console.log(
      "DB connected:",
      `${process.env.DB_HOST}:${process.env.DB_PORT}`
    );
    eventBus.emit("connected");
    return true;
  } catch (err: any) {
    attempts += 1;
    const code = err?.code || err?.message || err;
    console.warn(`DB connect attempt ${attempts} failed:`, code);
    return false;
  }
}

async function queryWithTimeout<T = RowDataPacket[]>(
  sql: string,
  params: any[] = [],
  timeoutMs: number = 8000,
  maxRetries: number = 2
): Promise<[T, FieldPacket[]] | T> {
  const transientCodes = new Set([
    "ECONNRESET",
    "PROTOCOL_CONNECTION_LOST",
    "ETIMEDOUT",
    "EPIPE",
    "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  ]);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const start = Date.now();
    try {
      const poolRef = await getPool();
      if (!poolRef)
        throw Object.assign(new Error("Database not available"), {
          code: "DB_NOT_AVAILABLE",
        });

      const p = poolRef.execute(sql, params);
      const timeout = new Promise((_, rej) =>
        setTimeout(
          () => rej(new Error(`DB query timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      );
      const result = await Promise.race([p, timeout]);

      const dur = Date.now() - start;
      console.info(
        `[DB] query OK (${dur}ms) sql=${sql
          .split(/\s+/)
          .slice(0, 6)
          .join(" ")} paramsLen=${params.length}`
      );

      return result as any;
    } catch (err: any) {
      const dur = Date.now() - start;
      console.warn(
        `[DB] query ERR (${dur}ms) sql=${sql
          .split(/\s+/)
          .slice(0, 6)
          .join(" ")} err=${err?.code || err?.message || err}`
      );

      if (attempt < maxRetries && transientCodes.has(err?.code)) {
        const backoff = 200 * Math.pow(2, attempt);
        console.info(
          `[DB] transient error ${err.code} - retrying attempt ${
            attempt + 1
          } after ${backoff}ms`
        );
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error("DB query failed after retries");
}

async function connectLoop(): Promise<void> {
  if (connecting) return;
  connecting = true;
  console.log("Starting DB connect loop to", process.env.DB_HOST);
  while (!pool) {
    const ok = await tryConnectOnce();
    if (ok) break;
    if (SKIP_DB_ON_START === "true" && attempts > 0) {
      console.warn(
        "SKIP_DB_ON_START=true — continuing without DB. Will still retry in background."
      );
      break;
    }
    const backoff = Math.min(
      Number(DB_RETRY_BACKOFF_MS) * Math.max(1, attempts),
      60_000
    );
    await new Promise((r) => setTimeout(r, backoff));
  }
  connecting = false;
  if (!pool) {
    setInterval(async () => {
      if (!pool) await tryConnectOnce();
    }, Math.max(5000, Number(DB_RETRY_BACKOFF_MS)));
  }
}

async function getPool(): Promise<Pool | null> {
  if (pool) return pool;
  if (IS_SERVERLESS) {
    await tryConnectOnce();
    return pool;
  }
  await tryConnectOnce();
  return pool;
}

async function query(sql: string, params: any[] = []): Promise<any> {
  return queryWithTimeout(sql, params);
}

// only start background connect loop for long-running servers
if (!IS_SERVERLESS) {
  connectLoop().catch((err) => {
    console.error("DB connect loop error:", err?.message || err);
  });
} else {
  console.log(
    "Serverless mode detected: DB background loop disabled (will try per-request)."
  );
}

export default {
  getPool,
  query,
  isDbAvailable,
  tryConnectOnce,
  on: (ev: string, cb: (...args: any[]) => void) => eventBus.on(ev, cb),
};
