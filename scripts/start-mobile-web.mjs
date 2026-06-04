#!/usr/bin/env node
import { execFileSync, spawn } from "node:child_process";

const START_PORT = Number(process.env.EXPO_WEB_PORT ?? process.env.EXPO_METRO_PORT ?? 8081);
const MAX_PORT = Math.min(65535, START_PORT + 20);

function isPortFree(port) {
  try {
    const output = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
    return output.length === 0;
  } catch {
    return true;
  }
}

async function findFreePort() {
  for (let port = START_PORT; port <= MAX_PORT; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(`No free web port found between ${START_PORT} and ${MAX_PORT}`);
}

const port = await findFreePort();
console.log(`[mobile:web] using port ${port}`);

const child = spawn("pnpm", ["exec", "expo", "start", "--web", "--port", String(port)], {
  stdio: "inherit",
  env: {
    ...process.env,
    EXPO_WEB_PORT: String(port),
    EXPO_METRO_PORT: String(port),
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
