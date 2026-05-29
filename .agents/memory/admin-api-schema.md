---
name: Admin API + DB schema
description: Details on the 5 admin tables, their routes, and the db package's no-build-script quirk
---

## Admin tables (lib/db/src/schema/index.ts)
- `toll_plazas` — plazaId, name, route, location, status, operatorId, operatorName, workerCount, activeDevices
- `operators` — userId, name, mobile, email, plazaId, plazaName, status, lastLogin, loginCount, deviceCount
- `devices` — deviceId, deviceName, deviceType, deviceModel, imei, operatorId, operatorName, plazaName, status, unauthorizedAttempts
- `security_events` — eventType, description, deviceId, operatorId, operatorName, severity, resolved (0/1 integer)
- `audit_logs` — action, performedBy, targetType, targetId, details

## Routes (artifacts/api-server/src/routes/admin.ts)
GET/POST /api/admin/plazas, operators, devices, security-events, audit-logs
PUT /api/admin/plazas/:id, operators/:userId, devices/:deviceId, security-events/:id/resolve
GET /api/admin/stats — aggregated KPIs from all tables

## Seeding
`seedAdminData()` called on first GET to each collection — inserts demo rows if tables are empty (guarded by INSERT OR IGNORE on unique keys).

## db package quirk
`@workspace/db` has no `build` script — it exports directly from `./src/index.ts`. TypeScript strict typecheck of api-server produces TS6305 "output file not built" warnings for db imports — these are pre-existing and harmless at runtime (esbuild resolves source directly).

**Why:** The monorepo uses pnpm workspaces with source-direct exports for lib packages to avoid a separate build step.

**How to apply:** Ignore TS6305 errors in api-server typecheck; only fix actual logic errors (TS7030 etc). Run `pnpm --filter @workspace/api-server run typecheck 2>&1 | grep "error TS" | grep -v "TS6305"` to see real errors only.
