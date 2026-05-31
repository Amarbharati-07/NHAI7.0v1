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

Mobile: set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_DOMAIN` as needed.

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
