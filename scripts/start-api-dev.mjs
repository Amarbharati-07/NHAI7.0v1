#!/usr/bin/env node
/**
 * Start API unless something healthy is already on PORT (default 3000).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const apiDir = path.join(repoRoot, "artifacts/api-server");
const port = process.env.PORT ?? "3000";
const healthUrl = `http://127.0.0.1:${port}/api/health`;
const readyUrl = `http://127.0.0.1:${port}/api/health/ready`;

async function isApiHealthy() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.status === "ok";
  } catch {
    return false;
  }
}

async function checkDatabaseReady() {
  try {
    const res = await fetch(readyUrl, { signal: AbortSignal.timeout(6_000) });
    if (res.ok) return true;
    const body = await res.json().catch(() => ({}));
    console.warn(`
  WARNING: API is up but PostgreSQL is not reachable.
  ${body?.database ?? `GET ${readyUrl} returned ${res.status}`}

  Fix artifacts/api-server/.env → DATABASE_URL, then restart API.
  See README → Environment.
`);
    return false;
  } catch {
    return false;
  }
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  if (await isApiHealthy()) {
    await checkDatabaseReady();
    console.log(`
  API is already running on port ${port}
  Health: ${healthUrl} → ok
  DB:     ${readyUrl} (must return status ok for admin/login)

  You do NOT need to start dev:api again.
  Run mobile only:  pnpm run dev:mobile
  Or both:          pnpm run dev  (API step will skip)
`);
    return;
  }

  console.log(`[start-api-dev] No API on port ${port} — building and starting…\n`);
  await run("pnpm", ["run", "build"], apiDir);
  await run("pnpm", ["run", "dev:server"], apiDir);
}

main().catch((err) => {
  console.error("[start-api-dev] failed:", err.message ?? err);
  if (String(err.message ?? err).includes("EADDRINUSE")) {
    console.error(`
  Port ${port} is in use but health check failed.
  Free the port:  lsof -ti :${port} | xargs kill -9
  Then run:       pnpm run dev:api
`);
  }
  process.exit(1);
});
