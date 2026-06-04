import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
type Database = ReturnType<typeof drizzle>;

function missingDatabaseError(): Error {
  return new Error(
    "DATABASE_URL must be set before using the database. Add it to your .env file and restart the server.",
  );
}

/** channel_binding=require can hang some Node/pg builds against Neon. */
function sanitizeDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("channel_binding");
    return parsed.toString();
  } catch {
    return url.replace(/([?&])channel_binding=require(&|$)/g, "$1").replace(/[?&]$/, "");
  }
}

const databaseUrl = process.env.DATABASE_URL ? sanitizeDatabaseUrl(process.env.DATABASE_URL) : undefined;

export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      max: 10,
      keepAlive: true,
    })
  : null;
export const db = databaseUrl
  ? drizzle(pool as pg.Pool, { schema })
  : new Proxy(
      {},
      {
        get() {
          throw missingDatabaseError();
        },
      },
    ) as Database;

export * from "./schema";
