#!/usr/bin/env node
/**
 * Start local Postgres (Docker) and print DATABASE_URL for artifacts/api-server/.env
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_URL = "postgresql://nhai:nhai@127.0.0.1:5432/nhai_dev";

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", cwd: repoRoot, ...opts });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function isPostgresReady() {
  return new Promise((resolve) => {
    const child = spawn(
      "docker",
      ["compose", "exec", "-T", "postgres", "pg_isready", "-U", "nhai", "-d", "nhai_dev"],
      { cwd: repoRoot, stdio: "ignore" },
    );
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function waitForPostgres(maxMs = 45_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await isPostgresReady()) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Postgres did not become ready in time");
}

async function main() {
  console.log("\n[db:local] Starting Docker Postgres…\n");
  await run("docker", ["compose", "up", "-d", "postgres"]);
  await waitForPostgres();

  console.log(`
[db:local] Postgres is ready.

Set this in artifacts/api-server/.env (replace Neon URL for local dev):

  DATABASE_URL=${LOCAL_URL}

Then apply schema and restart API:

  pnpm --filter @workspace/db run push
  pnpm run kill:api
  pnpm run dev:api

Verify:

  curl -s http://127.0.0.1:3000/api/health/ready
`);
}

main().catch((err) => {
  console.error("[db:local] failed:", err.message ?? err);
  console.error(`
Docker is not installed. Use Homebrew Postgres instead:

  brew install postgresql@16
  brew services start postgresql@16
  pnpm run db:setup

Or fix your cloud DATABASE_URL in artifacts/api-server/.env (Neon dashboard → wake project → copy new URL).
`);
  process.exit(1);
});
