import type { Request, Response, NextFunction } from "express";
import { pingDatabase } from "../routes/health";

type Readiness = { ok: true } | { ok: false; error: string };

let cached: { at: number; result: Readiness } | null = null;
const CACHE_MS = 4_000;

export async function getDatabaseReadiness(force = false): Promise<Readiness> {
  const now = Date.now();
  if (!force && cached && now - cached.at < CACHE_MS) {
    return cached.result;
  }
  const result = await pingDatabase(4_000);
  cached = { at: now, result };
  return result;
}

export function invalidateDatabaseReadinessCache(): void {
  cached = null;
}

/** Respond 503 immediately when PostgreSQL is down (avoids 30s client abort on hanging queries). */
export async function requireDatabaseMiddleware(req: Request, res: Response, next: NextFunction) {
  const db = await getDatabaseReadiness();
  if (db.ok) {
    next();
    return;
  }

  console.warn("[db] request blocked — database not ready", {
    method: req.method,
    path: req.path,
    error: db.error,
  });

  res.status(503).json({
    error: "database_unavailable",
    message: "PostgreSQL is not reachable. Check DATABASE_URL in artifacts/api-server/.env and restart the API.",
    detail: db.error,
  });
}
