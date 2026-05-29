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

const router = Router();

/* ─── Seed helper (runs once to populate demo data) ─── */

async function seedAdminData() {
  const existing = await db.select({ c: count() }).from(tollPlazasTable);
  if ((existing[0]?.c ?? 0) > 0) return;

  await db.insert(tollPlazasTable).values([
    { plazaId: "PLZ001", name: "NH-48 Gurugram Plaza", route: "NH-48", location: "Gurugram, Haryana", operatorId: "OPR001", operatorName: "Rajan Mehta", workerCount: 32, activeDevices: 2, attendanceToday: 30, attendancePct: 94, status: "active", lastSync: "Recently" },
    { plazaId: "PLZ002", name: "NH-8 Manesar Plaza",   route: "NH-8",  location: "Manesar, Haryana",  operatorId: "OPR002", operatorName: "Kavita Joshi", workerCount: 28, activeDevices: 2, attendanceToday: 24, attendancePct: 86, status: "active",      lastSync: "Recently" },
    { plazaId: "PLZ003", name: "NH-44 Panipat Plaza",  route: "NH-44", location: "Panipat, Haryana",  operatorId: "OPR003", operatorName: "Arun Patel",   workerCount: 25, activeDevices: 1, attendanceToday: 23, attendancePct: 92, status: "active",      lastSync: "Recently" },
    { plazaId: "PLZ004", name: "NH-58 Meerut Plaza",   route: "NH-58", location: "Meerut, UP",        operatorId: "",       operatorName: "Unassigned",   workerCount: 0,  activeDevices: 0, attendanceToday: 0,  attendancePct: 0,  status: "inactive",   lastSync: "Never" },
    { plazaId: "PLZ005", name: "NH-24 Delhi Toll",     route: "NH-24", location: "Delhi",             operatorId: "OPR004", operatorName: "Shreya Singh", workerCount: 18, activeDevices: 1, attendanceToday: 15, attendancePct: 83, status: "maintenance", lastSync: "Recently" },
  ]).onConflictDoNothing();

  await db.insert(operatorsTable).values([
    { userId: "OPR001", name: "Rajan Mehta",  mobile: "9811234567", email: "rajan@nhai.in",   plazaId: "PLZ001", plazaName: "NH-48 Gurugram Plaza", status: "active",    lastLogin: "Today, 08:15 AM", loginCount: 142, deviceCount: 1 },
    { userId: "OPR002", name: "Kavita Joshi", mobile: "9822345678", email: "kavita@nhai.in",  plazaId: "PLZ002", plazaName: "NH-8 Manesar Plaza",   status: "active",    lastLogin: "Today, 09:02 AM", loginCount: 98,  deviceCount: 1 },
    { userId: "OPR003", name: "Arun Patel",   mobile: "9833456789", email: "arun@nhai.in",    plazaId: "PLZ003", plazaName: "NH-44 Panipat Plaza",  status: "active",    lastLogin: "Today, 07:48 AM", loginCount: 87,  deviceCount: 1 },
    { userId: "OPR004", name: "Shreya Singh", mobile: "9844567890", email: "shreya@nhai.in",  plazaId: "PLZ005", plazaName: "NH-24 Delhi Toll",     status: "suspended", lastLogin: "3 days ago",      loginCount: 54,  deviceCount: 1 },
    { userId: "OPR005", name: "Vikram Rao",   mobile: "9855678901", email: "vikram@nhai.in",  plazaId: "",       plazaName: "Unassigned",           status: "pending",   lastLogin: "Never",           loginCount: 0,   deviceCount: 0 },
  ]).onConflictDoNothing();

  await db.insert(devicesTable).values([
    { deviceId: "DEV001", deviceName: "Plaza Device 1", deviceType: "android", deviceModel: "Samsung Galaxy A54", imei: "357891234567890", operatorId: "OPR001", operatorName: "Rajan Mehta",  plazaName: "NH-48 Gurugram", status: "active",  lastActive: "Recently",   unauthorizedAttempts: 0, allocatedAt: "2024-01-15" },
    { deviceId: "DEV002", deviceName: "Plaza Device 2", deviceType: "android", deviceModel: "Realme GT Neo 5",   imei: "358012345678901", operatorId: "OPR002", operatorName: "Kavita Joshi", plazaName: "NH-8 Manesar",   status: "active",  lastActive: "Recently",   unauthorizedAttempts: 0, allocatedAt: "2024-02-01" },
    { deviceId: "DEV003", deviceName: "Plaza Device 3", deviceType: "ios",     deviceModel: "iPhone 14",         imei: "359123456789012", operatorId: "OPR003", operatorName: "Arun Patel",   plazaName: "NH-44 Panipat",  status: "active",  lastActive: "Recently",   unauthorizedAttempts: 1, allocatedAt: "2024-02-20" },
    { deviceId: "DEV004", deviceName: "Unallocated",    deviceType: "android", deviceModel: "OnePlus 11",        imei: "360234567890123", operatorId: "",       operatorName: "Unassigned",   plazaName: "—",              status: "blocked", lastActive: "3 days ago", unauthorizedAttempts: 4, allocatedAt: "2024-03-01" },
    { deviceId: "DEV005", deviceName: "New Device",     deviceType: "ios",     deviceModel: "iPhone 15",         imei: "361345678901234", operatorId: "",       operatorName: "Unassigned",   plazaName: "—",              status: "pending", lastActive: "Never",      unauthorizedAttempts: 0, allocatedAt: "2024-05-20" },
  ]).onConflictDoNothing();

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

router.get("/admin/stats", async (_req, res) => {
  try {
    await seedAdminData();
    const today = new Date().toISOString().split("T")[0]!;

    const [plazas, operators, devices, unresolvedEvents, workers, attStats] = await Promise.all([
      db.select().from(tollPlazasTable),
      db.select().from(operatorsTable),
      db.select().from(devicesTable),
      db.select({ c: count() }).from(securityEventsTable).where(eq(securityEventsTable.resolved, 0)),
      db.select({ c: count() }).from(workersTable).where(eq(workersTable.status, "active")),
      db.select({ status: attendanceTable.status, c: count() })
        .from(attendanceTable)
        .where(eq(attendanceTable.date, today))
        .groupBy(attendanceTable.status),
    ]);

    const present = attStats.find((r: { status: string | null; c: number }) => r.status === "present")?.c ?? 0;
    const absent  = attStats.find((r: { status: string | null; c: number }) => r.status === "absent")?.c ?? 0;
    const totalWorkers = workers[0]?.c ?? 0;

    res.json({
      totalPlazas:          plazas.length,
      activePlazas:         plazas.filter((p: { status: string | null }) => p.status === "active").length,
      totalOperators:       operators.length,
      activeOperators:      operators.filter((o: { status: string | null }) => o.status === "active").length,
      totalWorkers,
      presentToday:         present,
      absentToday:          absent,
      activeDevices:        devices.filter((d: { status: string | null }) => d.status === "active").length,
      unauthorizedAttempts: unresolvedEvents[0]?.c ?? 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
});

/* ─── Toll Plazas ─── */

router.get("/admin/plazas", async (_req, res) => {
  try {
    await seedAdminData();
    const rows = await db.select().from(tollPlazasTable).orderBy(tollPlazasTable.name);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch plazas" });
  }
});

router.post("/admin/plazas", async (req, res) => {
  try {
    const { name, route, location } = req.body;
    if (!name) return void res.status(400).json({ error: "name is required" });
    const plazaId = `PLZ${Date.now()}`;
    const [row] = await db.insert(tollPlazasTable).values({ plazaId, name, route: route ?? "", location: location ?? "", status: "inactive" }).returning();
    await db.insert(auditLogsTable).values({ action: "Plaza Created", performedBy: req.body.performedBy ?? "ADMIN", targetType: "TollPlaza", targetId: plazaId, details: `${name} created` });
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Failed to create plaza" });
  }
});

router.put("/admin/plazas/:plazaId", async (req, res) => {
  try {
    const { plazaId } = req.params;
    const { name, route, location, status, operatorId, operatorName, workerCount, activeDevices } = req.body;
    await db.update(tollPlazasTable)
      .set({ ...(name && { name }), ...(route !== undefined && { route }), ...(location !== undefined && { location }), ...(status && { status }), ...(operatorId !== undefined && { operatorId }), ...(operatorName !== undefined && { operatorName }), ...(workerCount !== undefined && { workerCount }), ...(activeDevices !== undefined && { activeDevices }) })
      .where(eq(tollPlazasTable.plazaId, plazaId!));
    await db.insert(auditLogsTable).values({ action: "Plaza Updated", performedBy: req.body.performedBy ?? "ADMIN", targetType: "TollPlaza", targetId: plazaId!, details: JSON.stringify(req.body) });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update plaza" });
  }
});

router.delete("/admin/plazas/:plazaId", async (req, res) => {
  try {
    const { plazaId } = req.params;
    await db.delete(tollPlazasTable).where(eq(tollPlazasTable.plazaId, plazaId!));
    await db.insert(auditLogsTable).values({ action: "Plaza Deleted", performedBy: req.body.performedBy ?? "ADMIN", targetType: "TollPlaza", targetId: plazaId!, details: "" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete plaza" });
  }
});

/* ─── Operators ─── */

router.get("/admin/operators", async (_req, res) => {
  try {
    await seedAdminData();
    const rows = await db.select().from(operatorsTable).orderBy(operatorsTable.name);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch operators" });
  }
});

router.post("/admin/operators", async (req, res) => {
  try {
    const { userId, name, mobile, email, plazaId, plazaName } = req.body;
    if (!userId || !name) return void res.status(400).json({ error: "userId and name required" });
    const [row] = await db.insert(operatorsTable).values({ userId: userId.toUpperCase(), name, mobile: mobile ?? "", email: email ?? "", plazaId: plazaId ?? "", plazaName: plazaName ?? "Unassigned", status: "pending" }).returning();
    await db.insert(auditLogsTable).values({ action: "Operator Created", performedBy: req.body.performedBy ?? "ADMIN", targetType: "Operator", targetId: userId, details: `${name} created` });
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Failed to create operator" });
  }
});

router.put("/admin/operators/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, mobile, email, plazaId, plazaName, status } = req.body;
    await db.update(operatorsTable)
      .set({ ...(name && { name }), ...(mobile !== undefined && { mobile }), ...(email !== undefined && { email }), ...(plazaId !== undefined && { plazaId }), ...(plazaName !== undefined && { plazaName }), ...(status && { status }) })
      .where(eq(operatorsTable.userId, userId!));
    await db.insert(auditLogsTable).values({ action: "Operator Updated", performedBy: req.body.performedBy ?? "ADMIN", targetType: "Operator", targetId: userId!, details: JSON.stringify(req.body) });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update operator" });
  }
});

/* ─── Devices ─── */

router.get("/admin/devices", async (_req, res) => {
  try {
    await seedAdminData();
    const rows = await db.select().from(devicesTable).orderBy(desc(devicesTable.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Failed to fetch devices" });
  }
});

router.post("/admin/devices", async (req, res) => {
  try {
    const { deviceName, deviceType, deviceModel, imei, operatorId, operatorName, plazaName } = req.body;
    if (!deviceName) return void res.status(400).json({ error: "deviceName required" });
    const deviceId = `DEV${Date.now()}`;
    const [row] = await db.insert(devicesTable).values({ deviceId, deviceName, deviceType: deviceType ?? "android", deviceModel: deviceModel ?? "", imei: imei ?? "", operatorId: operatorId ?? "", operatorName: operatorName ?? "Unassigned", plazaName: plazaName ?? "", status: "pending" }).returning();
    await db.insert(auditLogsTable).values({ action: "Device Registered", performedBy: req.body.performedBy ?? "ADMIN", targetType: "Device", targetId: deviceId, details: `${deviceName} registered` });
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Failed to register device" });
  }
});

router.put("/admin/devices/:deviceId", async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status, operatorId, operatorName, plazaName, unauthorizedAttempts } = req.body;
    await db.update(devicesTable)
      .set({ ...(status && { status }), ...(operatorId !== undefined && { operatorId }), ...(operatorName !== undefined && { operatorName }), ...(plazaName !== undefined && { plazaName }), ...(unauthorizedAttempts !== undefined && { unauthorizedAttempts }) })
      .where(eq(devicesTable.deviceId, deviceId!));
    await db.insert(auditLogsTable).values({ action: "Device Updated", performedBy: req.body.performedBy ?? "ADMIN", targetType: "Device", targetId: deviceId!, details: JSON.stringify(req.body) });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update device" });
  }
});

/* ─── Security Events ─── */

router.get("/admin/security-events", async (_req, res) => {
  try {
    await seedAdminData();
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
    await seedAdminData();
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
