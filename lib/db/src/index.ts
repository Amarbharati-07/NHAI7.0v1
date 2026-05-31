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

const databaseUrl = process.env.DATABASE_URL;

export const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
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
