#!/usr/bin/env node
/**
 * Set up local PostgreSQL without Docker (Homebrew on macOS).
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repoRoot, "artifacts/api-server/.env");
const LOCAL_URL = "postgresql://nhai:nhai@127.0.0.1:5432/nhai_dev";

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", cwd: repoRoot, ...opts });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function runCapture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout?.on("data", (d) => { out += d; });
    child.stderr?.on("data", (d) => { out += d; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(out.trim() || `${command} failed`));
    });
  });
}

async function hasPostgres() {
  try {
    await runCapture("pg_isready", ["-h", "127.0.0.1", "-p", "5432"]);
    return true;
  } catch {
    return false;
  }
}

function upsertEnvDatabaseUrl() {
  const line = `DATABASE_URL=${LOCAL_URL}`;
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath, `${line}\nPORT=3000\nHOST=0.0.0.0\nALLOW_DEMO_SEED=true\n`);
    console.log(`[setup-local-db] Created ${envPath}`);
    return;
  }
  const text = fs.readFileSync(envPath, "utf8");
  if (/^DATABASE_URL=/m.test(text)) {
    fs.writeFileSync(envPath, text.replace(/^DATABASE_URL=.*$/m, line));
  } else {
    fs.writeFileSync(envPath, `${line}\n${text}`);
  }
  console.log(`[setup-local-db] Updated DATABASE_URL in artifacts/api-server/.env`);
}

async function main() {
  if (!(await hasPostgres())) {
    console.log(`
PostgreSQL is not running on 127.0.0.1:5432.

Install and start it (macOS Homebrew):

  brew install postgresql@16
  brew services start postgresql@16
  echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc

Create user/database (run once):

  createuser -s nhai 2>/dev/null || true
  createdb -O nhai nhai_dev 2>/dev/null || true

Then run again:

  pnpm run db:setup
`);
    process.exit(1);
  }

  console.log("[setup-local-db] Postgres is up — configuring .env …");
  upsertEnvDatabaseUrl();

  console.log("[setup-local-db] Applying schema (drizzle push) …");
  await run("pnpm", ["--filter", "@workspace/db", "run", "push"], {
    env: { ...process.env, DATABASE_URL: LOCAL_URL },
  });

  console.log(`
Done. Restart the API:

  pnpm run kill:api
  pnpm run dev:api

Verify:

  curl -s http://127.0.0.1:3000/api/health/ready
`);
}

main().catch((err) => {
  console.error("[setup-local-db]", err.message ?? err);
  process.exit(1);
});
