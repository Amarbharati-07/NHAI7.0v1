# NHAI Workforce Management & Smart Attendance System

Workforce management and smart attendance for NHAI toll plazas: facial recognition attendance, offline sync, and admin oversight.

## Run locally

```bash
pnpm install
pnpm --filter @workspace/api-server run dev    # API — port 3000
pnpm --filter @workspace/mockup-sandbox run dev # UI preview — port 5000
pnpm --filter @workspace/mobile run dev         # Expo dev server + QR (port 8081)
pnpm --filter @workspace/mobile run dev:web     # Browser only (no QR)
pnpm --filter @workspace/mobile run dev:tunnel  # QR via tunnel (different Wi‑Fi)
pnpm --filter @workspace/mobile run dev:usb     # Android USB (adb reverse + localhost)
pnpm run mobile:expo -- config --type public     # Expo CLI from repo root
```

### Expo Go: “Failed to download remote update”

This usually means the phone cannot reach Metro on your Mac (not an EAS OTA failure). Try, in order:

1. Same Wi‑Fi on Mac and phone (avoid guest / “client isolation” networks).
2. `pnpm --filter @workspace/mobile run dev:tunnel` and scan the new QR code.
3. Android over USB: enable USB debugging, then `pnpm --filter @workspace/mobile run dev:usb`.
4. On macOS, allow **Node** in System Settings → Network → Firewall if prompted.

Use **pnpm**, not npm, for workspace commands (`pnpm --filter @workspace/mobile run dev`).
```

```bash
pnpm run typecheck
pnpm run build
```

## Environment

Copy `artifacts/api-server/.env.example` to `artifacts/api-server/.env` and set:

- `DATABASE_URL` — PostgreSQL connection string (required for API persistence)
- `PORT` — optional (default `3000`)
- `ADMIN_API_KEY` — optional; when set, admin routes require `Authorization: Bearer <key>`

Mobile: `pnpm run dev` / `dev:mobile` auto-writes `artifacts/mobile/.env` with your Mac’s LAN IP. Start the API on the same machine (`pnpm run dev:api`). If you see **`EADDRINUSE` port 3000**, the API is already running — use `pnpm run dev:mobile` only, or free the port with `pnpm run kill:api` then start again. If login shows **Network request failed**, run `curl http://<your-lan-ip>:3000/api/health` on the Mac; it must return `{"status":"ok"}` before the phone can log in.

If **add plaza** or admin lists show **Aborted** / timeout but health is OK, PostgreSQL is not reachable:

```bash
curl -s http://127.0.0.1:3000/api/health/ready   # must be {"status":"ok","database":"ok"}
```

**Local Postgres (fastest fix):**

```bash
pnpm run db:local
# Set DATABASE_URL=postgresql://nhai:nhai@127.0.0.1:5432/nhai_dev in artifacts/api-server/.env
pnpm --filter @workspace/db run push
pnpm run kill:api && pnpm run dev:api
```

Or fix your cloud `DATABASE_URL` in `artifacts/api-server/.env`, then restart the API.

## Stack

- pnpm workspaces, Node.js 20+, TypeScript 5.9
- API: Express 5 + Drizzle ORM + PostgreSQL
- Mobile: Expo (React Native), expo-sqlite offline storage
- UI preview: Vite + React + Tailwind CSS 4

## Layout

| Path | Purpose |
|------|---------|
| `artifacts/api-server/` | Express API |
| `artifacts/mobile/` | Expo mobile app |
| `artifacts/mockup-sandbox/` | Component preview (Vite) |
| `lib/db/` | Drizzle schema & client |
| `lib/api-spec/` | OpenAPI spec |
| `lib/api-zod/` | Generated Zod schemas |
| `lib/api-client-react/` | Generated React Query hooks |

## Codegen & database

```bash
pnpm --filter @workspace/api-spec run codegen   # after openapi.yaml changes
pnpm --filter @workspace/db run push            # dev schema push
```

## Health check

`GET /api/healthz` → `{ "status": "ok" }`
