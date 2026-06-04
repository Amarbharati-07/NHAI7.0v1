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
const port = process.env.EXPO_METRO_PORT ?? "8081";

console.log(`
  ┌─────────────────────────────────────────────────────────────┐
  │  REQUIRED: API server (second terminal on this Mac)         │
  │    pnpm run dev:api                                         │
  │  Wait for: "Server listening" on port 3000                   │
  │  Test: curl http://${ip}:3000/api/health                      │
  └─────────────────────────────────────────────────────────────┘

  Expo Go (same Wi‑Fi as this Mac):
    exp://${ip}:${port}

  Mobile only (this terminal):
    pnpm --filter @workspace/mobile run dev

  Both API + mobile together:
    pnpm run dev
`);
