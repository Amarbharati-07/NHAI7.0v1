#!/usr/bin/env node
import os from "node:os";

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

const ip = lanIp();
const port = process.env.PORT ?? "3000";
console.log(`\n  Mobile .env (phone on same Wi‑Fi):\n  EXPO_PUBLIC_API_URL=http://${ip}:${port}/api\n`);
console.log(`  Health check: curl http://${ip}:${port}/api/healthz\n`);
