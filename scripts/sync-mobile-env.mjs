#!/usr/bin/env node
/**
 * Writes artifacts/mobile/.env with the current LAN IP for EXPO_PUBLIC_API_URL.
 * Run before `expo start` so phones on Wi‑Fi reach the API on this Mac.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function lanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

const mobileDir = path.resolve(scriptDir, "../artifacts/mobile");
const envPath = path.join(mobileDir, ".env");
const examplePath = path.join(mobileDir, ".env.example");
const ip = lanIp();
const port = process.env.PORT ?? "3000";
const apiLine = `EXPO_PUBLIC_API_URL=http://${ip}:${port}/api`;

let lines = [];
if (fs.existsSync(envPath)) {
  lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
} else if (fs.existsSync(examplePath)) {
  lines = fs.readFileSync(examplePath, "utf8").split(/\r?\n/);
}

let replaced = false;
const next = lines.map((line) => {
  if (line.startsWith("EXPO_PUBLIC_API_URL=")) {
    replaced = true;
    return apiLine;
  }
  return line;
});
if (!replaced) {
  next.push(apiLine);
}

const body = `${next.filter((line, index, arr) => line.length > 0 || index < arr.length - 1).join("\n").trimEnd()}\n`;
fs.writeFileSync(envPath, body, "utf8");
console.log(`[sync-mobile-env] ${envPath}\n  ${apiLine}\n`);
