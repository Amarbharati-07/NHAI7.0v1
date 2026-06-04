import { Router } from "express";
import { db } from "@workspace/db";
import {
  tollPlazasTable,
  operatorsTable,
  devicesTable,
  securityEventsTable,
  auditLogsTable,
  workersTable,
  attendanceTable,
} from "@workspace/db/schema";
import { eq, desc, sql, count } from "drizzle-orm";
import { requireAdminApiKey } from "../middleware/adminAuth";
import { hashPassword } from "./auth";

const router = Router();
router.use(requireAdminApiKey);

function stripOperatorSecrets<T extends { passwordHash?: string | null }>(row: T) {
  const { passwordHash: _removed, ...safe } = row;
  return safe;
}

function normalizeDeviceId(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeImei(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.toUpperCase() === "N/A") return null;
  return normalized;
}

function parseCoordinate(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRadius(value: unknown): number {
  if (value === undefined || value === null || value === "") return 300;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 300;
}

function getSqlErrorDetails(err: unknown): {
  code?: string;
  message?: string;
  constraint?: string;
  detail?: string;
} {
  const visited = new Set<any>();
  let current: any = err;
  while (current?.cause && !visited.has(current.cause)) {
    visited.add(current);
    current = current.cause;
  }

  const error = current as any;
  return {
    code: error?.code,
    message: error?.message ?? String(err),
    constraint: error?.constraint,
    detail: error?.detail,
  };
}

function parseDuplicateKeyDetail(detail?: string): { column?: string; value?: string } {
  if (!detail) return {};
  const match = detail.match(/Key \((?<column>[^)]+)\)=\((?<value>.*)\) already exists\./i);
  return {
    column: match?.groups?.column,
    value: match?.groups?.value,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function reconcilePlazaOperatorAssignment(input: {
  plazaId: string;
  plazaName: string;
  operatorId?: unknown;
  operatorName?: unknown;
  allowReassignment?: boolean;
}) {
  const plazaId = String(input.plazaId ?? "").trim();
  const plazaName = String(input.plazaName ?? "").trim();
  const nextOperatorId = String(input.operatorId ?? "").trim().toUpperCase();
  const nextOperatorName = String(input.operatorName ?? "").trim() || "Unassigned";
  const allowReassignment = Boolean(input.allowReassignment);

  const [current] = await db
    .select({
      operatorId: tollPlazasTable.operatorId,
      operatorName: tollPlazasTable.operatorName,
    })
    .from(tollPlazasTable)
    .where(eq(tollPlazasTable.plazaId, plazaId))
    .limit(1);

  const previousOperatorId = String(current?.operatorId ?? "").trim().toUpperCase();
  if (previousOperatorId && previousOperatorId !== nextOperatorId) {
    await db
      .update(operatorsTable)
      .set({ plazaId: "", plazaName: "Unassigned" })
      .where(eq(operatorsTable.userId, previousOperatorId));
  }

  if (!nextOperatorId) return;

  const duplicatePlazas = await db
    .select({ plazaId: tollPlazasTable.plazaId })
    .from(tollPlazasTable)
    .where(eq(tollPlazasTable.operatorId, nextOperatorId));

  const duplicatePlaza = duplicatePlazas.find((duplicate) => duplicate.plazaId !== plazaId);
  if (duplicatePlaza && !allowReassignment) {
    const [conflictPlaza] = await db
      .select({
        plazaId: tollPlazasTable.plazaId,
        name: tollPlazasTable.name,
      })
      .from(tollPlazasTable)
      .where(eq(tollPlazasTable.plazaId, duplicatePlaza.plazaId))
      .limit(1);
    throw new Error(`Operator already assigned to ${conflictPlaza?.name ?? duplicatePlaza.plazaId}`);
  }

  for (const duplicate of duplicatePlazas) {
    if (duplicate.plazaId === plazaId) continue;
    await db
      .update(tollPlazasTable)
      .set({ operatorId: "", operatorName: "Unassigned" })
      .where(eq(tollPlazasTable.plazaId, duplicate.plazaId));
  }

  await db
    .update(operatorsTable)
    .set({ plazaId, plazaName: nextOperatorName ? plazaName : "Unassigned" })
    .where(eq(operatorsTable.userId, nextOperatorId));
}

async function getAdminStatsSnapshot() {
  const today = new Date().toISOString().split("T")[0]!;

  const [plazaTotals, activePlazaTotals, operatorTotals, activeOperatorTotals, deviceTotals, activeDeviceTotals, unresolvedEvents, workers, attStats] = await Promise.all([
    db.select({ c: count() }).from(tollPlazasTable),
    db.select({ c: count() }).from(tollPlazasTable).where(eq(tollPlazasTable.status, "active")),
    db.select({ c: count() }).from(operatorsTable),
    db.select({ c: count() }).from(operatorsTable).where(eq(operatorsTable.status, "active")),
    db.select({ c: count() }).from(devicesTable),
    db.select({ c: count() }).from(devicesTable).where(eq(devicesTable.status, "active")),
    db.select({ c: count() }).from(securityEventsTable).where(eq(securityEventsTable.resolved, 0)),
    db.select({ c: count() }).from(workersTable).where(eq(workersTable.status, "active")),
    db.select({ status: attendanceTable.status, c: count() })
      .from(attendanceTable)
      .where(eq(attendanceTable.date, today))
      .groupBy(attendanceTable.status),
  ]);

  const totalPlazas = plazaTotals[0]?.c ?? 0;
  const activePlazas = activePlazaTotals[0]?.c ?? 0;
  const totalOperators = operatorTotals[0]?.c ?? 0;
  const activeOperators = activeOperatorTotals[0]?.c ?? 0;
  const activeDevices = activeDeviceTotals[0]?.c ?? 0;
  const totalWorkers = workers[0]?.c ?? 0;
  const presentToday = attStats.find((r: { status: string | null; c: number }) => r.status === "present")?.c ?? 0;
  const absentToday = attStats.find((r: { status: string | null; c: number }) => r.status === "absent")?.c ?? 0;
  const unauthorizedAttempts = unresolvedEvents[0]?.c ?? 0;

  return {
    totalPlazas,
    activePlazas,
    totalOperators,
    activeOperators,
    totalWorkers,
    presentToday,
    absentToday,
    activeDevices,
    unauthorizedAttempts,
  };
}

/* ─── Optional demo seed (never runs on GET — use POST /admin/seed-demo) ─── */

async function seedAdminData() {
  const existing = await db.select({ c: count() }).from(tollPlazasTable);
  if ((existing[0]?.c ?? 0) > 0) return;

  const demoOperatorPasswordHash = await hashPassword("opr123");

  await db.insert(tollPlazasTable).values([
    { plazaId: "PLZ001", name: "NH-48 Gurugram Plaza", route: "NH-48", location: "Gurugram, Haryana", latitude: 28.4595, longitude: 77.0266, radiusMeters: 300, operatorId: "OPR001", operatorName: "Rajan Mehta", workerCount: 32, activeDevices: 2, attendanceToday: 30, attendancePct: 94, status: "active", lastSync: "Recently" },
    { plazaId: "PLZ002", name: "NH-8 Manesar Plaza",   route: "NH-8",  location: "Manesar, Haryana",  latitude: 28.3489, longitude: 76.9356, radiusMeters: 300, operatorId: "OPR002", operatorName: "Kavita Joshi", workerCount: 28, activeDevices: 2, attendanceToday: 24, attendancePct: 86, status: "active",      lastSync: "Recently" },
    { plazaId: "PLZ003", name: "NH-44 Panipat Plaza",  route: "NH-44", location: "Panipat, Haryana",  latitude: 29.3909, longitude: 76.9635, radiusMeters: 300, operatorId: "OPR003", operatorName: "Arun Patel",   workerCount: 25, activeDevices: 1, attendanceToday: 23, attendancePct: 92, status: "active",      lastSync: "Recently" },
    { plazaId: "PLZ004", name: "NH-58 Meerut Plaza",   route: "NH-58", location: "Meerut, UP",        latitude: 28.9845, longitude: 77.7064, radiusMeters: 300, operatorId: "",       operatorName: "Unassigned",   workerCount: 0,  activeDevices: 0, attendanceToday: 0,  attendancePct: 0,  status: "inactive",   lastSync: "Never" },
    { plazaId: "PLZ005", name: "NH-24 Delhi Toll",     route: "NH-24", location: "Delhi",             latitude: 28.7041, longitude: 77.1025, radiusMeters: 300, operatorId: "OPR004", operatorName: "Shreya Singh", workerCount: 18, activeDevices: 1, attendanceToday: 15, attendancePct: 83, status: "maintenance", lastSync: "Recently" },
  ]).onConflictDoNothing();

  await db.insert(operatorsTable).values([
    { userId: "OPR001", passwordHash: demoOperatorPasswordHash, name: "Rajan Mehta",  mobile: "9811234567", email: "rajan@nhai.in",   plazaId: "PLZ001", plazaName: "NH-48 Gurugram Plaza", status: "active",    lastLogin: "Today, 08:15 AM", loginCount: 142, deviceCount: 1 },
    { userId: "OPR002", passwordHash: demoOperatorPasswordHash, name: "Kavita Joshi", mobile: "9822345678", email: "kavita@nhai.in",  plazaId: "PLZ002", plazaName: "NH-8 Manesar Plaza",   status: "active",    lastLogin: "Today, 09:02 AM", loginCount: 98,  deviceCount: 1 },
    { userId: "OPR003", passwordHash: demoOperatorPasswordHash, name: "Arun Patel",   mobile: "9833456789", email: "arun@nhai.in",    plazaId: "PLZ003", plazaName: "NH-44 Panipat Plaza",  status: "active",    lastLogin: "Today, 07:48 AM", loginCount: 87,  deviceCount: 1 },
    { userId: "OPR004", passwordHash: demoOperatorPasswordHash, name: "Shreya Singh", mobile: "9844567890", email: "shreya@nhai.in",  plazaId: "PLZ005", plazaName: "NH-24 Delhi Toll",     status: "suspended", lastLogin: "3 days ago",      loginCount: 54,  deviceCount: 1 },
    { userId: "OPR005", passwordHash: demoOperatorPasswordHash, name: "Vikram Rao",   mobile: "9855678901", email: "vikram@nhai.in",  plazaId: "",       plazaName: "Unassigned",           status: "pending",   lastLogin: "Never",           loginCount: 0,   deviceCount: 0 },
  ]).onConflictDoNothing();

  await db.insert(devicesTable).values([
    { deviceId: "DEV001", deviceName: "Plaza Device 1", deviceType: "android", deviceModel: "Samsung Galaxy A54", imei: "357891234567890", deviceToken: "", operatorId: "OPR001", operatorName: "Rajan Mehta",  plazaName: "NH-48 Gurugram", status: "active",  lastActive: "Recently",   unauthorizedAttempts: 0, allocatedAt: "2024-01-15" },
    { deviceId: "DEV002", deviceName: "Plaza Device 2", deviceType: "android", deviceModel: "Realme GT Neo 5",   imei: "358012345678901", deviceToken: "", operatorId: "OPR002", operatorName: "Kavita Joshi", plazaName: "NH-8 Manesar",   status: "active",  lastActive: "Recently",   unauthorizedAttempts: 0, allocatedAt: "2024-02-01" },
    { deviceId: "DEV003", deviceName: "Plaza Device 3", deviceType: "ios",     deviceModel: "iPhone 14",         imei: "359123456789012", deviceToken: "", operatorId: "OPR003", operatorName: "Arun Patel",   plazaName: "NH-44 Panipat",  status: "active",  lastActive: "Recently",   unauthorizedAttempts: 1, allocatedAt: "2024-02-20" },
    { deviceId: "DEV004", deviceName: "Unallocated",    deviceType: "android", deviceModel: "OnePlus 11",        imei: "360234567890123", deviceToken: "", operatorId: "",       operatorName: "Unassigned",   plazaName: "—",              status: "blocked", lastActive: "3 days ago", unauthorizedAttempts: 4, allocatedAt: "2024-03-01" },
    { deviceId: "DEV005", deviceName: "New Device",     deviceType: "ios",     deviceModel: "iPhone 15",         imei: "361345678901234", deviceToken: "", operatorId: "",       operatorName: "Unassigned",   plazaName: "—",              status: "pending", lastActive: "Never",      unauthorizedAttempts: 0, allocatedAt: "2024-05-20" },
  ] as any).onConflictDoNothing();

  await db.insert(securityEventsTable).values([
    { eventType: "unauthorized_device", description: "Unauthorized device attempted to access system",              deviceId: "DEV004", operatorName: "Unknown",       severity: "high",   resolved: 0 },
    { eventType: "failed_login",        description: "3 failed login attempts on OPR004 account",                  operatorId: "OPR004", operatorName: "Shreya Singh", severity: "medium", resolved: 1 },
    { eventType: "unauthorized_device", description: "OnePlus 11 blocked after 4 unauthorized attempts",           deviceId: "DEV004", operatorName: "Unknown",       severity: "high",   resolved: 1 },
    { eventType: "suspicious_activity", description: "Unusual attendance pattern detected at NH-8 Manesar Plaza",  operatorId: "OPR002", operatorName: "Kavita Joshi", severity: "medium", resolved: 0 },
    { eventType: "blocked_access",      description: "Access blocked: iPhone 12 not in authorized device list",    deviceId: "UNKNOWN", operatorName: "Unknown",      severity: "high",   resolved: 1 },
  ]).onConflictDoNothing();

  await db.insert(auditLogsTable).values([
    { action: "Operator Suspended", performedBy: "ADMIN001", targetType: "Operator", targetId: "OPR004", details: "Account suspended due to policy violation" },
    { action: "Device Blocked",     performedBy: "ADMIN001", targetType: "Device",   targetId: "DEV004", details: "Blocked after 4 unauthorized attempts" },
    { action: "Plaza Created",      performedBy: "ADMIN001", targetType: "TollPlaza",targetId: "PLZ005", details: "NH-24 Delhi Toll plaza registered" },
  ]).onConflictDoNothing();
}

/* ─── Dashboard Stats ─── */

router.post("/admin/seed-demo", async (_req, res) => {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    return void res.status(403).json({
      error: "Demo seed disabled. Set ALLOW_DEMO_SEED=true in api-server .env to enable.",
    });
  }
  try {
    await seedAdminData();
    res.json({ ok: true, message: "Demo data seeded (skipped if plazas already exist)" });
  } catch (err) {
    console.error("[admin/seed-demo]", err);
    res.status(500).json({ error: "Failed to seed demo data" });
  }
});

router.get("/admin/stats", async (_req, res) => {
  try {
    const stats = await getAdminStatsSnapshot();
    console.info("[admin/stats] dashboard stats response", stats);
    console.info("[admin/stats] plazas count", stats.totalPlazas);
    console.info("[admin/stats] operators count", stats.totalOperators);
    console.info("[admin/stats] devices count", stats.activeDevices);
    res.json(stats);
  } catch (err) {
    console.error("[admin/stats]", err);
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

router.get("/admin/dashboard", async (_req, res) => {
  try {
    const stats = await getAdminStatsSnapshot();
    console.info("[admin/dashboard] dashboard stats response", stats);
    res.json(stats);
  } catch (err) {
    console.error("[admin/dashboard]", err);
    res.status(500).json({ error: "Failed to fetch admin dashboard" });
  }
});

/* ─── Toll Plazas ─── */

router.get("/admin/plazas", async (_req, res) => {
  try {
    const rows = await db.select().from(tollPlazasTable).orderBy(tollPlazasTable.name);
    rows.forEach((plaza) => {
      console.log("GET response", {
        plaza,
        plazaId: plaza.plazaId,
        latitude: plaza.latitude,
        longitude: plaza.longitude,
        radiusMeters: plaza.radiusMeters,
      });
    });
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch plazas" });
  }
});

router.get("/admin/plazas/:plazaId", async (req, res) => {
  try {
    const plazaId = String(req.params.plazaId ?? "").trim();
    const [row] = await db
      .select()
      .from(tollPlazasTable)
      .where(eq(tollPlazasTable.plazaId, plazaId))
      .limit(1);
    if (!row) {
      return void res.status(404).json({ error: "Plaza not found" });
    }
    console.log("Edit Plaza Loaded Data", {
      plaza: row,
      plazaId: row.plazaId,
      latitude: row.latitude,
      longitude: row.longitude,
      radiusMeters: row.radiusMeters,
    });
    res.json(row);
  } catch (err) {
    console.error("[admin/plazas/:plazaId]", err);
    res.status(500).json({ error: "Failed to fetch plaza" });
  }
});

router.post("/admin/plazas", async (req, res) => {
    const startedAt = Date.now();
    try {
    const { name, route, location, latitude, longitude, radiusMeters, operatorId, operatorName, reassignOperator } = req.body;
    console.log("Before Save", req.body);
    console.log("API Request Body", req.body);
    console.log("Saving Plaza", {
      name,
      route,
      location,
      latitude,
      longitude,
      radiusMeters,
      operatorId,
      operatorName,
    });
    console.info("[admin/plazas POST] request received", {
      name: name ? String(name).trim() : undefined,
      route,
      location,
      ip: req.ip,
    });

    if (!name) return void res.status(400).json({ error: "name is required" });
    const plazaId = `PLZ${Date.now()}`;
    const nextOperatorId = String(operatorId ?? "").trim().toUpperCase();
    const nextOperatorName = String(operatorName ?? "").trim() || "Unassigned";

    if (nextOperatorId) {
      const duplicatePlazas = await db
        .select({
          plazaId: tollPlazasTable.plazaId,
          name: tollPlazasTable.name,
        })
        .from(tollPlazasTable)
        .where(eq(tollPlazasTable.operatorId, nextOperatorId));
      const duplicate = duplicatePlazas.find((row) => row.plazaId !== plazaId);
      if (duplicate && !Boolean(reassignOperator)) {
        return void res.status(409).json({
          error: `Operator already assigned to ${duplicate.name}`,
          conflict: {
            plazaId: duplicate.plazaId,
            plazaName: duplicate.name,
          },
        });
      }
    }

    console.info("[admin/plazas POST] database insert start", { plazaId });
    const insertStartedAt = Date.now();
    const prismaLikeUpdateObject = {
      plazaId,
      name: String(name).trim(),
      route: route ?? "",
      location: location ?? "",
      latitude: parseCoordinate(latitude),
      longitude: parseCoordinate(longitude),
      radiusMeters: parseRadius(radiusMeters),
      operatorId: nextOperatorId,
      operatorName: nextOperatorName,
      status: "inactive",
    };
    console.log("Prisma Update Data", prismaLikeUpdateObject);

    const [row] = await withTimeout(
      db
        .insert(tollPlazasTable)
        .values(prismaLikeUpdateObject)
        .returning(),
      12_000,
      "Create toll plaza",
    );

    console.info("[admin/plazas POST] database insert finish", {
      plazaId,
      ms: Date.now() - insertStartedAt,
    });

    if (!row) {
      return void res.status(500).json({ error: "Plaza insert returned no row" });
    }

    await reconcilePlazaOperatorAssignment({
      plazaId,
      plazaName: String(name).trim(),
      operatorId: nextOperatorId,
      operatorName: nextOperatorName,
      allowReassignment: Boolean(reassignOperator),
    });
    const [savedRow] = await db
      .select()
      .from(tollPlazasTable)
      .where(eq(tollPlazasTable.plazaId, plazaId))
      .limit(1);
    console.log("Database Row After Save", savedRow);

    await withTimeout(
      db.insert(auditLogsTable).values({
        action: "Plaza Created",
        performedBy: req.body.performedBy ?? "ADMIN",
        targetType: "TollPlaza",
        targetId: plazaId,
        details: `${name} created`,
      }),
      5_000,
      "Audit log for plaza create",
    ).catch((err) => {
      console.warn("[admin/plazas POST] audit log failed:", err);
    });

    console.info("[admin/plazas POST] response sent", {
      plazaId,
      status: 201,
      totalMs: Date.now() - startedAt,
    });
    console.log("API Response", savedRow ?? row);
    res.status(201).json(savedRow ?? row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create plaza";
    console.error("[admin/plazas POST] failed", {
      error: message,
      totalMs: Date.now() - startedAt,
    });
    res.status(message.includes("Operator already assigned") ? 409 : 500).json({ error: message });
  }
});

router.put("/admin/plazas/:plazaId", async (req, res) => {
  try {
    const { plazaId } = req.params;
    const { name, route, location, latitude, longitude, radiusMeters, status, operatorId, operatorName, workerCount, activeDevices, reassignOperator } = req.body;
    console.log("Before Save", req.body);
    console.log("API Request Body", req.body);
    console.log("Saving Plaza", {
      plazaId,
      name,
      route,
      location,
      latitude,
      longitude,
      radiusMeters,
      status,
      operatorId,
      operatorName,
      workerCount,
      activeDevices,
    });
    const [current] = await db
      .select({ operatorId: tollPlazasTable.operatorId, name: tollPlazasTable.name })
      .from(tollPlazasTable)
      .where(eq(tollPlazasTable.plazaId, plazaId!))
      .limit(1);
    const nextOperatorId = operatorId !== undefined ? String(operatorId ?? "").trim().toUpperCase() : undefined;
    const nextOperatorName = operatorName !== undefined ? String(operatorName ?? "").trim() || "Unassigned" : undefined;
    if (nextOperatorId) {
      const duplicates = await db
        .select({
          plazaId: tollPlazasTable.plazaId,
          name: tollPlazasTable.name,
        })
        .from(tollPlazasTable)
        .where(eq(tollPlazasTable.operatorId, nextOperatorId));
      const conflict = duplicates.find((row) => row.plazaId !== plazaId);
      if (conflict && !Boolean(reassignOperator)) {
        return void res.status(409).json({
          error: `Operator already assigned to ${conflict.name}`,
          conflict: {
            plazaId: conflict.plazaId,
            plazaName: conflict.name,
          },
        });
      }
    }
    const prismaLikeUpdateObject = {
      ...(name && { name }),
      ...(route !== undefined && { route }),
      ...(location !== undefined && { location }),
      ...(latitude !== undefined && { latitude: parseCoordinate(latitude) }),
      ...(longitude !== undefined && { longitude: parseCoordinate(longitude) }),
      ...(radiusMeters !== undefined && { radiusMeters: parseRadius(radiusMeters) }),
      ...(status && { status }),
      ...(operatorId !== undefined && { operatorId: nextOperatorId }),
      ...(operatorName !== undefined && { operatorName: nextOperatorName }),
      ...(workerCount !== undefined && { workerCount }),
      ...(activeDevices !== undefined && { activeDevices }),
    };
    console.log("Prisma Update Data", prismaLikeUpdateObject);
    await db.update(tollPlazasTable)
      .set(prismaLikeUpdateObject)
      .where(eq(tollPlazasTable.plazaId, plazaId!));
    if (operatorId !== undefined || operatorName !== undefined) {
      await reconcilePlazaOperatorAssignment({
        plazaId: plazaId!,
        plazaName: String(name ?? current?.name ?? "").trim(),
        operatorId: nextOperatorId ?? current?.operatorId ?? "",
        operatorName: nextOperatorName ?? undefined,
        allowReassignment: Boolean(reassignOperator),
      });
    }
    const [updated] = await db
      .select()
      .from(tollPlazasTable)
      .where(eq(tollPlazasTable.plazaId, plazaId!))
      .limit(1);
    console.log("Database Row After Save", updated);
    await db.insert(auditLogsTable).values({ action: "Plaza Updated", performedBy: req.body.performedBy ?? "ADMIN", targetType: "TollPlaza", targetId: plazaId!, details: JSON.stringify(req.body) });
    console.log("API Response", updated);
    res.json(updated ?? { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update plaza";
    res.status(message.includes("Operator already assigned") ? 409 : 500).json({ error: message });
  }
});

router.delete("/admin/plazas/:plazaId", async (req, res) => {
  try {
    const plazaId = String(req.params.plazaId ?? "");
    const performedBy = String(req.query.performedBy ?? "ADMIN");
    const removed = await db
      .delete(tollPlazasTable)
      .where(eq(tollPlazasTable.plazaId, plazaId))
      .returning({ plazaId: tollPlazasTable.plazaId });
    if (removed.length === 0) {
      return void res.status(404).json({ error: "Plaza not found" });
    }
    await db.insert(auditLogsTable).values({
      action: "Plaza Deleted",
      performedBy,
      targetType: "TollPlaza",
      targetId: plazaId,
      details: `Deleted ${plazaId}`,
    });
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete plaza";
    console.error("[admin/plazas DELETE]", err);
    res.status(500).json({ error: message });
  }
});

/* ─── Operators ─── */

router.get("/admin/operators", async (_req, res) => {
  try {
    const rows = await db.select().from(operatorsTable).orderBy(operatorsTable.name);
    res.json(rows.map(stripOperatorSecrets));
  } catch {
    res.status(500).json({ error: "Failed to fetch operators" });
  }
});

router.post("/admin/operators", async (req, res) => {
  try {
    const { userId, name, mobile, email, plazaId, plazaName, password, status } = req.body;
    if (!userId || !name) return void res.status(400).json({ error: "userId and name required" });
    if (!password || String(password).length < 4) {
      return void res.status(400).json({ error: "password is required (min 4 characters)" });
    }
    const uid = String(userId).toUpperCase();
    const passwordHash = await hashPassword(String(password));
    const [row] = await db.insert(operatorsTable).values({
      userId: uid,
      passwordHash,
      name,
      mobile: mobile ?? "",
      email: email ?? "",
      plazaId: plazaId ?? "",
      plazaName: plazaName ?? "Unassigned",
      status: status ?? "active",
    }).returning();
    await db.insert(auditLogsTable).values({ action: "Operator Created", performedBy: req.body.performedBy ?? "ADMIN", targetType: "Operator", targetId: uid, details: `${name} created` });
    res.status(201).json(stripOperatorSecrets(row));
  } catch (err) {
    console.error("[admin/operators POST]", err);
    res.status(500).json({ error: "Failed to create operator" });
  }
});

router.put("/admin/operators/:userId", async (req, res) => {
  try {
    const uid = String(req.params.userId ?? "").toUpperCase();
    if (!uid) return void res.status(400).json({ error: "userId required" });

    const { name, mobile, email, plazaId, plazaName, status, password } = req.body;
    console.info("[admin/operators PUT] request", {
      userId: uid,
      hasPassword: Boolean(password),
      fields: Object.keys(req.body ?? {}),
    });
    const updates: Record<string, unknown> = {
      ...(name && { name }),
      ...(mobile !== undefined && { mobile }),
      ...(email !== undefined && { email }),
      ...(plazaId !== undefined && { plazaId }),
      ...(plazaName !== undefined && { plazaName }),
      ...(status && { status }),
    };
    if (password && String(password).length >= 4) {
      updates.passwordHash = await hashPassword(String(password));
    }
    if (Object.keys(updates).length === 0) {
      return void res.status(400).json({ error: "No valid fields to update" });
    }

    const updated = await db
      .update(operatorsTable)
      .set(updates)
      .where(eq(operatorsTable.userId, uid))
      .returning({ userId: operatorsTable.userId });

    if (updated.length === 0) {
      return void res.status(404).json({ error: "Operator not found" });
    }

    const action = password ? "Password Reset" : "Operator Updated";
    const details = password
      ? `Password reset for ${uid}`
      : JSON.stringify(req.body);
    await db.insert(auditLogsTable).values({
      action,
      performedBy: req.body.performedBy ?? "ADMIN",
      targetType: "Operator",
      targetId: uid,
      details,
    });
    console.info("[admin/operators PUT] success", {
      userId: uid,
      passwordUpdated: Boolean(password),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/operators PUT]", err);
    res.status(500).json({ error: "Failed to update operator" });
  }
});

router.delete("/admin/operators/:userId", async (req, res) => {
  try {
    const uid = String(req.params.userId ?? "").toUpperCase();
    const performedBy = String(req.query.performedBy ?? "ADMIN");
    if (!uid) return void res.status(400).json({ error: "userId required" });

    const removed = await db
      .delete(operatorsTable)
      .where(eq(operatorsTable.userId, uid))
      .returning({ userId: operatorsTable.userId });
    if (removed.length === 0) {
      return void res.status(404).json({ error: "Operator not found" });
    }

    await db.insert(auditLogsTable).values({
      action: "Operator Deleted",
      performedBy,
      targetType: "Operator",
      targetId: uid,
      details: `Deleted operator ${uid}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/operators DELETE]", err);
    res.status(500).json({ error: "Failed to delete operator" });
  }
});

/* ─── Devices ─── */

router.get("/admin/devices", async (_req, res) => {
  console.log("[DEVICES] Request received");
  try {
    console.log("[DEVICES] Before database query");
    const rows = await withTimeout(
      db.select().from(devicesTable).orderBy(desc(devicesTable.createdAt)),
      8000,
      "Load devices",
    );
    console.log("[DEVICES] After database query", { count: rows.length });
    console.log("[DEVICES] Before response");
    return void res.json(rows);
  } catch (err) {
    console.error("[DEVICES] Query failed", err);
    const sqlError = getSqlErrorDetails(err);
    console.log("[DEVICES] Before response");
    return void res.status(500).json({
      error: sqlError.detail || sqlError.message || "Failed to fetch devices",
      code: sqlError.code,
      constraint: sqlError.constraint,
    });
  }
});

router.post("/admin/devices", async (req, res) => {
  try {
    console.log("[DEVICE CREATE] Request Payload", req.body);
    const {
      deviceId: clientDeviceId,
      deviceName,
      deviceType,
      deviceModel,
      imei,
      deviceToken,
      operatorId,
      operatorName,
      plazaId,
      plazaName,
      status,
      performedBy,
    } = req.body;
    const validationErrors: Record<string, string> = {};
    const deviceId = normalizeDeviceId(clientDeviceId ?? `DEV${Date.now()}`);
    if (!deviceId) validationErrors.deviceId = "deviceId required";
    if (!deviceName?.trim()) validationErrors.deviceName = "deviceName required";
    if (!String(deviceType ?? "").trim()) validationErrors.deviceType = "deviceType required";
    if (!String(deviceModel ?? "").trim()) validationErrors.deviceModel = "deviceModel required";
    const normalizedImei = normalizeImei(imei);
    const validationResult = {
      ok: Object.keys(validationErrors).length === 0,
      errors: validationErrors,
      deviceId,
      imei: normalizedImei,
      operatorAllocation: {
        operatorId: String(operatorId ?? "").trim(),
        operatorName: String(operatorName ?? "").trim(),
      },
      plazaAssignment: {
        plazaId: String(plazaId ?? "").trim(),
        plazaName: String(plazaName ?? "").trim(),
      },
    };
    console.log("[DEVICE CREATE] Validation Result", validationResult);
    if (!validationResult.ok) {
      return void res.status(400).json({
        error: "Validation failed",
        details: validationErrors,
      });
    }

    if (normalizedImei) {
      const imeiMatch = await db
        .select({ deviceId: devicesTable.deviceId, imei: devicesTable.imei })
        .from(devicesTable)
        .where(eq(devicesTable.imei, normalizedImei))
        .limit(1);
      if (imeiMatch.length > 0) {
        return void res.status(409).json({
          error: `IMEI ${normalizedImei} already exists. Use a different IMEI or update the existing device.`,
          field: "imei",
          duplicate: imeiMatch[0],
        });
      }
    }

    const deviceIdMatch = await db
      .select({ deviceId: devicesTable.deviceId })
      .from(devicesTable)
      .where(eq(devicesTable.deviceId, deviceId))
      .limit(1);
    if (deviceIdMatch.length > 0) {
      return void res.status(409).json({
        error: `Device ID ${deviceId} already exists. Use a different Device ID or update the existing device.`,
        field: "deviceId",
        duplicate: deviceIdMatch[0],
      });
    }

    const payload = {
      deviceId,
      deviceName: String(deviceName).trim(),
      deviceType: deviceType ?? "android",
      deviceModel: deviceModel ?? "",
      imei: normalizedImei,
      deviceToken: deviceToken ?? "",
      operatorId: String(operatorId ?? "").trim().toUpperCase(),
      operatorName: operatorName ?? "Unassigned",
      plazaName: plazaName ?? "",
      status: status ?? "pending",
    } as const;
    console.log("[DEVICE CREATE] Allocation Result", {
      operatorId: payload.operatorId,
      operatorName: payload.operatorName,
      plazaId,
      plazaName: payload.plazaName,
      status: payload.status,
    });

    const row = await db.transaction(async (tx) => {
      const insertedRows = await tx.insert(devicesTable).values(payload as any).returning();
      const inserted = insertedRows[0];
      console.log("[DEVICE CREATE] SQL Insert Result", inserted);
      if (!inserted) {
        throw new Error("Device insert returned no row");
      }

      const [verified] = await tx
        .select()
        .from(devicesTable)
        .where(eq(devicesTable.deviceId, deviceId))
        .limit(1);
      if (!verified) {
        throw new Error(`Inserted device ${deviceId} was not found after insert`);
      }

      await tx.insert(auditLogsTable).values({
        action: "Device Registered",
        performedBy: performedBy ?? "ADMIN",
        targetType: "Device",
        targetId: deviceId,
        details: JSON.stringify({
          deviceId,
          deviceName: payload.deviceName,
          deviceType: payload.deviceType,
          deviceModel: payload.deviceModel,
          imei: payload.imei,
          deviceToken: payload.deviceToken,
          operatorId: payload.operatorId,
          operatorName: payload.operatorName,
          plazaId,
          plazaName: payload.plazaName,
          status: payload.status,
        }),
      });

      return verified;
    });

    console.log("[DEVICE CREATE] Final Response", row);
    return void res.status(201).json(row);
  } catch (err) {
    const sqlError = getSqlErrorDetails(err);
    const duplicate = parseDuplicateKeyDetail(sqlError.detail);
    console.error("[DEVICE CREATE] Exception", {
      sqlErrorCode: sqlError.code,
      sqlErrorMessage: sqlError.message,
      constraintName: sqlError.constraint,
      duplicateKeyDetails: duplicate,
      detail: sqlError.detail,
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (sqlError.code === "23505") {
      if (sqlError.constraint === "devices_device_id_unique" || duplicate.column === "device_id") {
        return void res.status(409).json({
          error: `Device ID ${normalizeDeviceId(req.body?.deviceId ?? "")} already exists. Use a different Device ID or update the existing device.`,
          field: "deviceId",
        });
      }
      if (sqlError.constraint === "devices_imei_unique" || duplicate.column === "imei") {
        const imeiValue = normalizeImei(req.body?.imei);
        return void res.status(409).json({
          error: imeiValue
            ? `IMEI ${imeiValue} already exists. Use a different IMEI or update the existing device.`
            : "This IMEI already exists. Use a different IMEI or update the existing device.",
          field: "imei",
        });
      }
      return void res.status(409).json({
        error: sqlError.detail || sqlError.message || "Duplicate device record detected.",
      });
    }
    return void res.status(500).json({
      error: sqlError.detail || sqlError.message || "Failed to register device",
      code: sqlError.code,
      constraint: sqlError.constraint,
      detail: sqlError.detail,
    });
  }
});

router.put("/admin/devices/:deviceId", async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status, operatorId, operatorName, plazaName, unauthorizedAttempts, deviceToken } = req.body;
    const normalizedOperatorId =
      operatorId !== undefined ? String(operatorId).trim().toUpperCase() : undefined;
    await db.update(devicesTable)
      .set({
        ...(status && { status }),
        ...(normalizedOperatorId !== undefined && { operatorId: normalizedOperatorId }),
        ...(operatorName !== undefined && { operatorName }),
        ...(plazaName !== undefined && { plazaName }),
        ...(unauthorizedAttempts !== undefined && { unauthorizedAttempts }),
        ...(deviceToken !== undefined && { deviceToken }),
      } as any)
      .where(eq(devicesTable.deviceId, deviceId!));
    await db.insert(auditLogsTable).values({ action: "Device Updated", performedBy: req.body.performedBy ?? "ADMIN", targetType: "Device", targetId: deviceId!, details: JSON.stringify(req.body) });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update device" });
  }
});

router.delete("/admin/devices/:deviceId", async (req, res) => {
  try {
    const deviceId = String(req.params.deviceId ?? "");
    const performedBy = String(req.query.performedBy ?? "ADMIN");
    if (!deviceId) return void res.status(400).json({ error: "deviceId required" });

    const removed = await db
      .delete(devicesTable)
      .where(eq(devicesTable.deviceId, deviceId))
      .returning({ deviceId: devicesTable.deviceId });
    if (removed.length === 0) {
      return void res.status(404).json({ error: "Device not found" });
    }

    await db.insert(auditLogsTable).values({
      action: "Device Deleted",
      performedBy,
      targetType: "Device",
      targetId: deviceId,
      details: `Deleted device ${deviceId}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/devices DELETE]", err);
    res.status(500).json({ error: "Failed to delete device" });
  }
});

/* ─── Security Events ─── */

router.get("/admin/security-events", async (_req, res) => {
  try {
    const rows = await db.select().from(securityEventsTable).orderBy(desc(securityEventsTable.createdAt)).limit(50);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch security events" });
  }
});

router.post("/admin/security-events", async (req, res) => {
  try {
    const { eventType, description, deviceId, operatorId, operatorName, severity } = req.body;
    if (!eventType || !description) return void res.status(400).json({ error: "eventType and description required" });
    const [row] = await db.insert(securityEventsTable).values({ eventType, description, deviceId: deviceId ?? "", operatorId: operatorId ?? "", operatorName: operatorName ?? "", severity: severity ?? "medium", resolved: 0 }).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Failed to create security event" });
  }
});

router.put("/admin/security-events/:id/resolve", async (req, res) => {
  try {
    const id = parseInt(req.params.id!, 10);
    await db.update(securityEventsTable).set({ resolved: 1 }).where(eq(securityEventsTable.id, id));
    await db.insert(auditLogsTable).values({ action: "Security Event Resolved", performedBy: req.body.performedBy ?? "ADMIN", targetType: "SecurityEvent", targetId: String(id), details: "" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to resolve event" });
  }
});

/* ─── Audit Logs ─── */

router.get("/admin/audit-logs", async (_req, res) => {
  try {
    const rows = await db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.createdAt)).limit(100);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

router.post("/admin/audit-logs", async (req, res) => {
  try {
    const { action, performedBy, targetType, targetId, details } = req.body;
    if (!action || !performedBy) return void res.status(400).json({ error: "action and performedBy required" });
    const [row] = await db.insert(auditLogsTable).values({ action, performedBy, targetType: targetType ?? "", targetId: targetId ?? "", details: details ?? "" }).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Failed to create audit log" });
  }
});

export default router;
