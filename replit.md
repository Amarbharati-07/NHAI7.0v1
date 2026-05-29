# NHAI Workforce Management & Smart Attendance System

A workforce management and smart attendance system for NHAI (National Highways Authority of India) toll plazas, featuring facial recognition for attendance, offline synchronization, and administrative oversight.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 3000)
- `pnpm --filter @workspace/mockup-sandbox run dev` — run the UI component preview server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned by Replit)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 3000)
- DB: PostgreSQL + Drizzle ORM (Replit managed)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Mobile: Expo (React Native) with offline SQLite support
- UI Preview: Vite + React + Tailwind CSS 4 (port 5000)

## Where things live

- `artifacts/api-server/` — Express API server
- `artifacts/mobile/` — Expo/React Native mobile app
- `artifacts/mockup-sandbox/` — UI component preview server (Vite)
- `lib/db/` — Drizzle schema + DB client (`lib/db/src/schema/index.ts` is the schema source of truth)
- `lib/api-spec/` — OpenAPI specification (`openapi.yaml`)
- `lib/api-zod/` — Generated Zod schemas
- `lib/api-client-react/` — Generated React Query hooks

## Architecture decisions

- Monorepo with pnpm workspaces — each package has its own `package.json`
- API server uses esbuild to bundle to a single CJS file for fast startup
- Drizzle ORM with `drizzle-zod` for type-safe DB access and auto-generated validation schemas
- Orval generates React Query hooks and Zod schemas from the OpenAPI spec — always run codegen after spec changes
- Mobile app uses expo-sqlite for offline-first support with background sync to the API

## Workflows

- **API Server** — `PORT=3000 pnpm --filter @workspace/api-server run dev` (console output)
- **Start application** — `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/mockup-sandbox run dev` (webview)

## Health check

- `GET /api/healthz` → `{ "status": "ok" }`

## User preferences

- Use pnpm for all package management (enforced by preinstall script)

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Always run `pnpm --filter @workspace/db run push` after changing the DB schema
- The API server's `dev` script rebuilds before starting — no separate watch mode
- `DATABASE_URL` is auto-provisioned by Replit; never hardcode it
