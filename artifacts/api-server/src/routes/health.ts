import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function sendHealth(_req: any, res: any) {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

async function pingDatabase(timeoutMs = 4_000): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pool) {
    return { ok: false, error: "DATABASE_URL is not set (copy artifacts/api-server/.env.example to .env)" };
  }
  try {
    await withTimeout(pool.query("SELECT 1"), timeoutMs, "Database ping");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database unreachable";
    return { ok: false, error: message };
  }
}

router.get("/health", sendHealth);
router.get("/healthz", sendHealth);

/** Fails with 503 when PostgreSQL is missing or unreachable (admin/login data routes need DB). */
router.get("/health/ready", async (_req, res) => {
  const db = await pingDatabase();
  if (!db.ok) {
    res.status(503).json({ status: "degraded", database: db.error });
    return;
  }
  res.json({ status: "ok", database: "ok" });
});

export { pingDatabase };
export default router;
