import { Platform } from "react-native";

export type WorkerStatus = "active" | "inactive" | "transferred";

export interface Worker {
  id?: number;
  workerId: string;
  fullName: string;
  mobile: string;
  department: string;
  contractorName: string;
  employeeType: string;
  siteLocation: string;
  plazaId?: string;
  operatorId?: string;
  deviceToken?: string;
  status?: WorkerStatus;
  createdAt?: string;
}

export interface AuditLog {
  id?: number;
  workerId: number;
  action: string;
  fieldChanged?: string;
  oldValue?: string;
  newValue?: string;
  changedBy: string;
  createdAt?: string;
}

export interface AttendanceRecord {
  id?: number;
  workerId: number;
  workerName?: string;
  workerIdCode?: string;
  date: string;
  time: string;
  status: "present" | "absent";
  syncStatus: "pending" | "synced";
  plazaId?: string;
  operatorId?: string;
  deviceToken?: string;
  createdAt?: string;
}

export interface FaceImage {
  id?: number;
  workerId: number;
  imageType: string;
  imagePath: string;
  captured: boolean;
  createdAt?: string;
}

export interface SyncRecord {
  id?: number;
  recordType: string;
  recordId: number;
  status: "pending" | "synced" | "failed";
  createdAt?: string;
}

const IS_WEB = Platform.OS === "web";

/* ═══════════════════════════════════════════════════════════════
   WEB  —  pure in-memory store (no SQLite worker, no OPFS)
   ═══════════════════════════════════════════════════════════════ */

interface WebStore {
  workers: (Worker & { id: number })[];
  attendance: (AttendanceRecord & { id: number })[];
  faceImages: (FaceImage & { id: number })[];
  syncQueue: (SyncRecord & { id: number })[];
  auditLog: (AuditLog & { id: number })[];
  settings: Record<string, string>;
  seeded: boolean;
}

const webStore: WebStore = {
  workers: [],
  attendance: [],
  faceImages: [],
  syncQueue: [],
  auditLog: [],
  settings: { darkMode: "false" },
  seeded: false,
};

let webStoreNextId = { workers: 1, attendance: 1, faceImages: 1, syncQueue: 1, auditLog: 1 };

function nowIso(): string { return new Date().toISOString(); }
function todayStr(): string { return new Date().toISOString().split("T")[0]; }
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().split("T")[0];
}

function seedWebStore(): void {
  if (webStore.seeded) return;
  webStore.seeded = true;

  const baseWorkers: Omit<Worker, "id" | "createdAt">[] = [
    { workerId: "WRK001", fullName: "Rajesh Kumar",   mobile: "9876543210", department: "Civil",      contractorName: "ABC Constructions", employeeType: "Contract",  siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "", status: "active" },
    { workerId: "WRK002", fullName: "Priya Sharma",   mobile: "9876543211", department: "Electrical", contractorName: "XYZ Electricals",   employeeType: "Permanent", siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "", status: "active" },
    { workerId: "WRK003", fullName: "Amit Singh",     mobile: "9876543212", department: "Plumbing",   contractorName: "ABC Constructions", employeeType: "Contract",  siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "", status: "active" },
    { workerId: "WRK004", fullName: "Sunita Verma",   mobile: "9876543213", department: "Civil",      contractorName: "DEF Projects",      employeeType: "Temporary", siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "", status: "active" },
    { workerId: "WRK005", fullName: "Mohan Lal",      mobile: "9876543214", department: "Security",   contractorName: "GHI Security",      employeeType: "Contract",  siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "", status: "active" },
    { workerId: "WRK006", fullName: "Kavitha Nair",   mobile: "9876543215", department: "Admin",      contractorName: "Internal",          employeeType: "Permanent", siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "", status: "active" },
  ];

  baseWorkers.forEach((w) => {
    webStore.workers.push({ ...w, id: webStoreNextId.workers++, createdAt: nowIso() });
  });

  const today = todayStr();
  const yesterday = daysAgo(1);
  const dayBefore = daysAgo(2);

  const baseAttendance: Omit<AttendanceRecord, "id" | "createdAt" | "workerName" | "workerIdCode">[] = [
    { workerId: 1, date: today,     time: "08:32", status: "present", syncStatus: "pending", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 2, date: today,     time: "08:45", status: "present", syncStatus: "pending", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 3, date: today,     time: "09:10", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 4, date: today,     time: "00:00", status: "absent",  syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 5, date: today,     time: "07:58", status: "present", syncStatus: "pending", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 1, date: yesterday, time: "08:15", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 2, date: yesterday, time: "08:30", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 3, date: yesterday, time: "00:00", status: "absent",  syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 4, date: yesterday, time: "09:00", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 5, date: dayBefore, time: "08:20", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: 6, date: dayBefore, time: "00:00", status: "absent",  syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
  ];

  baseAttendance.forEach((a) => {
    webStore.attendance.push({ ...a, id: webStoreNextId.attendance++, createdAt: nowIso() });
  });
}

function getWorkerById_web(id: number) {
  return webStore.workers.find((w) => w.id === id) ?? null;
}

function enrichAttendance(a: AttendanceRecord & { id: number }): AttendanceRecord {
  const w = getWorkerById_web(a.workerId);
  return { ...a, workerName: w?.fullName, workerIdCode: w?.workerId };
}

/* web implementations */
async function web_insertWorker(form: Parameters<typeof insertWorker>[0]): Promise<number> {
  seedWebStore();
  const id = webStoreNextId.workers++;
  webStore.workers.unshift({ ...form, id, status: "active", createdAt: nowIso() });
  webStore.syncQueue.push({ id: webStoreNextId.syncQueue++, recordType: "worker", recordId: id, status: "pending", createdAt: nowIso() });
  return id;
}

async function web_insertAttendance(record: Parameters<typeof insertAttendance>[0]): Promise<number> {
  seedWebStore();
  const id = webStoreNextId.attendance++;
  webStore.attendance.unshift({ ...record, id, status: (record.status as "present" | "absent") ?? "present", syncStatus: (record.syncStatus as "pending" | "synced") ?? "pending", createdAt: nowIso() });
  return id;
}

async function web_getWorkers(): Promise<Worker[]> {
  seedWebStore();
  return [...webStore.workers].sort((a, b) => b.createdAt!.localeCompare(a.createdAt!));
}

async function web_getWorkerById(id: number): Promise<Worker | null> {
  seedWebStore();
  return getWorkerById_web(id);
}

async function web_getAttendanceRecords(): Promise<AttendanceRecord[]> {
  seedWebStore();
  return [...webStore.attendance].sort((a, b) => b.createdAt!.localeCompare(a.createdAt!)).map(enrichAttendance);
}

async function web_getAttendanceHistory(): Promise<AttendanceRecord[]> {
  seedWebStore();
  return [...webStore.attendance].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)).map(enrichAttendance);
}

async function web_getSyncQueue(): Promise<SyncRecord[]> {
  seedWebStore();
  return [...webStore.syncQueue].sort((a, b) => b.createdAt!.localeCompare(a.createdAt!));
}

async function web_markSynced(recordId: number): Promise<void> {
  seedWebStore();
  const rec = webStore.syncQueue.find((r) => r.id === recordId);
  if (rec) rec.status = "synced";
}

async function web_getAppSetting(key: string): Promise<string | null> {
  return webStore.settings[key] ?? null;
}

async function web_setAppSetting(key: string, value: string): Promise<void> {
  webStore.settings[key] = value;
}

async function web_getWorkerAttendance(workerId: number): Promise<AttendanceRecord[]> {
  seedWebStore();
  return webStore.attendance.filter((a) => a.workerId === workerId).sort((a, b) => b.date.localeCompare(a.date)).map(enrichAttendance);
}

async function web_getWorkersByPlaza(plazaId: string, status?: WorkerStatus): Promise<Worker[]> {
  seedWebStore();
  return webStore.workers.filter((w) => w.plazaId === plazaId && (!status || w.status === status)).sort((a, b) => a.fullName.localeCompare(b.fullName));
}

async function web_getWorkerFaceImageCount(workerId: number): Promise<number> {
  return webStore.faceImages.filter((f) => f.workerId === workerId && f.captured).length;
}

async function web_saveFaceImage(entry: Omit<FaceImage, "id" | "createdAt">): Promise<void> {
  webStore.faceImages.push({ ...entry, id: webStoreNextId.faceImages++, createdAt: nowIso() });
}

async function web_updateWorker(id: number, fields: Parameters<typeof updateWorker>[1], changedBy: string): Promise<void> {
  seedWebStore();
  const idx = webStore.workers.findIndex((w) => w.id === id);
  if (idx === -1) throw new Error("Worker not found");
  const original = webStore.workers[idx];
  const updated = { ...original, ...fields };
  webStore.workers[idx] = updated;
  const fieldMap = ["fullName", "mobile", "department", "contractorName", "employeeType", "siteLocation"] as const;
  for (const key of fieldMap) {
    if (fields[key] !== undefined && fields[key] !== (original as Record<string, unknown>)[key]) {
      webStore.auditLog.push({ id: webStoreNextId.auditLog++, workerId: id, action: "update_field", fieldChanged: key, oldValue: String((original as Record<string, unknown>)[key] ?? ""), newValue: String(fields[key]), changedBy, createdAt: nowIso() });
    }
  }
}

async function web_setWorkerStatus(id: number, status: WorkerStatus, changedBy: string): Promise<void> {
  seedWebStore();
  const w = webStore.workers.find((w) => w.id === id);
  if (!w) return;
  const oldStatus = w.status ?? "active";
  w.status = status;
  webStore.auditLog.push({ id: webStoreNextId.auditLog++, workerId: id, action: "status_change", fieldChanged: "status", oldValue: oldStatus, newValue: status, changedBy, createdAt: nowIso() });
}

async function web_addAuditLog(entry: Omit<AuditLog, "id" | "createdAt">): Promise<void> {
  webStore.auditLog.push({ ...entry, id: webStoreNextId.auditLog++, createdAt: nowIso() });
}

async function web_getWorkerAuditLogs(workerId: number): Promise<AuditLog[]> {
  return webStore.auditLog.filter((l) => l.workerId === workerId).sort((a, b) => b.createdAt!.localeCompare(a.createdAt!)).slice(0, 50);
}

async function web_getWorkerAttendanceStats(workerId: number): Promise<{ present: number; absent: number; total: number; rate: number }> {
  seedWebStore();
  const rows = webStore.attendance.filter((a) => a.workerId === workerId);
  const present = rows.filter((a) => a.status === "present").length;
  const absent  = rows.filter((a) => a.status === "absent").length;
  const total   = present + absent;
  return { present, absent, total, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
}

async function web_getAttendanceStats(): Promise<{ total: number; present: number; absent: number; pending: number }> {
  seedWebStore();
  const today = todayStr();
  const todayRows = webStore.attendance.filter((a) => a.date === today);
  const present = todayRows.filter((a) => a.status === "present").length;
  const absent  = todayRows.filter((a) => a.status === "absent").length;
  const pending = todayRows.filter((a) => a.syncStatus === "pending").length;
  return { total: present + absent, present, absent, pending };
}

async function web_clearAllAppData(): Promise<{ workers: number; attendance: number; syncQueue: number }> {
  const counts = { workers: webStore.workers.length, attendance: webStore.attendance.length, syncQueue: webStore.syncQueue.length };
  webStore.workers = [];
  webStore.attendance = [];
  webStore.faceImages = [];
  webStore.auditLog = [];
  webStore.syncQueue = [];
  webStore.seeded = false;
  return counts;
}

async function web_clearSyncedRecords(): Promise<number> {
  const count = webStore.syncQueue.filter((r) => r.status === "synced").length;
  webStore.syncQueue = webStore.syncQueue.filter((r) => r.status !== "synced");
  webStore.faceImages = webStore.faceImages.filter((f) => f.captured);
  return count;
}

async function web_getSyncStats(): Promise<{ pending: number; synced: number; failed: number; lastSync: string | null }> {
  seedWebStore();
  const pending = webStore.syncQueue.filter((r) => r.status === "pending").length;
  const synced  = webStore.syncQueue.filter((r) => r.status === "synced").length;
  const failed  = webStore.syncQueue.filter((r) => r.status === "failed").length;
  const lastRow = webStore.syncQueue.filter((r) => r.status === "synced").sort((a, b) => b.createdAt!.localeCompare(a.createdAt!)).at(0);
  return { pending, synced, failed, lastSync: lastRow?.createdAt ?? null };
}

async function web_getAttendanceForCSV(): Promise<AttendanceRecord[]> {
  seedWebStore();
  return [...webStore.attendance].sort((a, b) => b.date.localeCompare(a.date)).map(enrichAttendance);
}

async function web_getWeeklyAttendance(): Promise<{ day: string; count: number }[]> {
  seedWebStore();
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const result: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayName = DAY_NAMES[d.getDay()];
    const count = webStore.attendance.filter((a) => a.date === dateStr && a.status === "present").length;
    result.push({ day: dayName, count });
  }
  return result;
}

/* ═══════════════════════════════════════════════════════════════
   NATIVE  —  SQLite via expo-sqlite
   ═══════════════════════════════════════════════════════════════ */

let _db: import("expo-sqlite").SQLiteDatabase | null = null;

async function getDb(): Promise<import("expo-sqlite").SQLiteDatabase> {
  if (_db) return _db;
  const SQLite = await import("expo-sqlite");
  _db = await SQLite.openDatabaseAsync("spectraId.db");
  await initDb(_db);
  return _db;
}

async function initDb(db: import("expo-sqlite").SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workerId TEXT UNIQUE NOT NULL,
      fullName TEXT NOT NULL,
      mobile TEXT,
      department TEXT,
      contractorName TEXT,
      employeeType TEXT,
      siteLocation TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS face_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workerId INTEGER NOT NULL,
      imageType TEXT NOT NULL,
      imagePath TEXT,
      captured INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (workerId) REFERENCES workers(id)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workerId INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT DEFAULT 'present',
      syncStatus TEXT DEFAULT 'pending',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (workerId) REFERENCES workers(id)
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recordType TEXT NOT NULL,
      recordId INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const migrations = [
    "ALTER TABLE workers ADD COLUMN plazaId TEXT DEFAULT ''",
    "ALTER TABLE workers ADD COLUMN operatorId TEXT DEFAULT ''",
    "ALTER TABLE workers ADD COLUMN deviceToken TEXT DEFAULT ''",
    "ALTER TABLE attendance ADD COLUMN plazaId TEXT DEFAULT ''",
    "ALTER TABLE attendance ADD COLUMN operatorId TEXT DEFAULT ''",
    "ALTER TABLE attendance ADD COLUMN deviceToken TEXT DEFAULT ''",
    "ALTER TABLE workers ADD COLUMN status TEXT DEFAULT 'active'",
    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workerId INTEGER NOT NULL,
      action TEXT NOT NULL,
      fieldChanged TEXT,
      oldValue TEXT,
      newValue TEXT,
      changedBy TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (workerId) REFERENCES workers(id)
    )`,
  ];
  for (const sql of migrations) {
    try { await db.execAsync(sql); } catch { /* already exists */ }
  }

  await seedSQLite(db);
}

async function seedSQLite(db: import("expo-sqlite").SQLiteDatabase) {
  const existing = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM workers");
  if (existing && existing.count > 0) return;

  const workers = [
    { workerId: "WRK001", fullName: "Rajesh Kumar",   mobile: "9876543210", department: "Civil",      contractorName: "ABC Constructions", employeeType: "Contract",  siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: "WRK002", fullName: "Priya Sharma",   mobile: "9876543211", department: "Electrical", contractorName: "XYZ Electricals",   employeeType: "Permanent", siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: "WRK003", fullName: "Amit Singh",     mobile: "9876543212", department: "Plumbing",   contractorName: "ABC Constructions", employeeType: "Contract",  siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: "WRK004", fullName: "Sunita Verma",   mobile: "9876543213", department: "Civil",      contractorName: "DEF Projects",      employeeType: "Temporary", siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: "WRK005", fullName: "Mohan Lal",      mobile: "9876543214", department: "Security",   contractorName: "GHI Security",      employeeType: "Contract",  siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
    { workerId: "WRK006", fullName: "Kavitha Nair",   mobile: "9876543215", department: "Admin",      contractorName: "Internal",          employeeType: "Permanent", siteLocation: "NH-48 Gurugram Plaza", plazaId: "PLZ001", operatorId: "OPR001", deviceToken: "" },
  ];

  for (const w of workers) {
    await db.runAsync(
      "INSERT OR IGNORE INTO workers (workerId, fullName, mobile, department, contractorName, employeeType, siteLocation, plazaId, operatorId, deviceToken) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [w.workerId, w.fullName, w.mobile, w.department, w.contractorName, w.employeeType, w.siteLocation, w.plazaId, w.operatorId, w.deviceToken]
    );
  }

  const today     = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const dayBefore = new Date(Date.now() - 172800000).toISOString().split("T")[0];

  const attendanceData = [
    { workerId: 1, date: today,     time: "08:32", status: "present", syncStatus: "pending", plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 2, date: today,     time: "08:45", status: "present", syncStatus: "pending", plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 3, date: today,     time: "09:10", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 4, date: today,     time: "00:00", status: "absent",  syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 5, date: today,     time: "07:58", status: "present", syncStatus: "pending", plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 1, date: yesterday, time: "08:15", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 2, date: yesterday, time: "08:30", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 3, date: yesterday, time: "00:00", status: "absent",  syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 4, date: yesterday, time: "09:00", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 5, date: dayBefore, time: "08:20", status: "present", syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001" },
    { workerId: 6, date: dayBefore, time: "00:00", status: "absent",  syncStatus: "synced",  plazaId: "PLZ001", operatorId: "OPR001" },
  ];

  for (const a of attendanceData) {
    await db.runAsync(
      "INSERT INTO attendance (workerId, date, time, status, syncStatus, plazaId, operatorId) VALUES (?,?,?,?,?,?,?)",
      [a.workerId, a.date, a.time, a.status, a.syncStatus, a.plazaId, a.operatorId]
    );
  }

  await db.runAsync("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", ["darkMode", "false"]);
}

/* ═══════════════════════════════════════════════════════════════
   PUBLIC API  —  dispatches to web or native implementation
   ═══════════════════════════════════════════════════════════════ */

export async function insertWorker(
  form: {
    workerId: string; fullName: string; mobile: string;
    department: string; contractorName: string; employeeType: string; siteLocation: string;
    plazaId?: string; operatorId?: string; deviceToken?: string;
  }
): Promise<number> {
  if (IS_WEB) return web_insertWorker(form);
  const db = await getDb();
  const result = await db.runAsync(
    "INSERT INTO workers (workerId, fullName, mobile, department, contractorName, employeeType, siteLocation, plazaId, operatorId, deviceToken) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [form.workerId, form.fullName, form.mobile, form.department, form.contractorName, form.employeeType, form.siteLocation, form.plazaId ?? "", form.operatorId ?? "", form.deviceToken ?? ""]
  );
  await db.runAsync("INSERT INTO sync_queue (recordType, recordId, status) VALUES (?, ?, ?)", ["worker", result.lastInsertRowId, "pending"]);
  return result.lastInsertRowId;
}

export async function insertAttendance(
  record: {
    workerId: number; date: string; time: string; status?: string; syncStatus?: string;
    plazaId?: string; operatorId?: string; deviceToken?: string;
  }
): Promise<number> {
  if (IS_WEB) {
    const id = await web_insertAttendance(record);
    webStore.syncQueue.push({
      id: webStoreNextId.syncQueue++,
      recordType: "attendance",
      recordId: id,
      status: "pending",
      createdAt: nowIso(),
    });
    return id;
  }
  const db = await getDb();
  const result = await db.runAsync(
    "INSERT INTO attendance (workerId, date, time, status, syncStatus, plazaId, operatorId, deviceToken) VALUES (?,?,?,?,?,?,?,?)",
    [record.workerId, record.date, record.time, record.status ?? "present", record.syncStatus ?? "pending", record.plazaId ?? "", record.operatorId ?? "", record.deviceToken ?? ""]
  );
  await db.runAsync(
    "INSERT INTO sync_queue (recordType, recordId, status) VALUES (?, ?, ?)",
    ["attendance", result.lastInsertRowId, "pending"]
  );
  return result.lastInsertRowId;
}

export async function getWorkerByWorkerId(workerIdCode: string): Promise<Worker | null> {
  if (IS_WEB) {
    seedWebStore();
    return webStore.workers.find((w) => w.workerId === workerIdCode) ?? null;
  }
  const db = await getDb();
  return db.getFirstAsync<Worker>("SELECT * FROM workers WHERE workerId = ?", [workerIdCode]);
}

export async function getWorkers(): Promise<Worker[]> {
  if (IS_WEB) return web_getWorkers();
  const db = await getDb();
  return db.getAllAsync<Worker>("SELECT * FROM workers ORDER BY createdAt DESC");
}

export async function getWorkerById(id: number): Promise<Worker | null> {
  if (IS_WEB) return web_getWorkerById(id);
  const db = await getDb();
  return db.getFirstAsync<Worker>("SELECT * FROM workers WHERE id = ?", [id]);
}

export async function getAttendanceById(id: number): Promise<AttendanceRecord | null> {
  if (IS_WEB) {
    seedWebStore();
    const rec = webStore.attendance.find((a) => a.id === id);
    return rec ? enrichAttendance(rec) : null;
  }
  const db = await getDb();
  return db.getFirstAsync<AttendanceRecord>(
    `SELECT a.*, w.fullName as workerName, w.workerId as workerIdCode
     FROM attendance a LEFT JOIN workers w ON a.workerId = w.id
     WHERE a.id = ?`,
    [id]
  );
}

export async function getAttendanceRecords(): Promise<AttendanceRecord[]> {
  if (IS_WEB) return web_getAttendanceRecords();
  const db = await getDb();
  return db.getAllAsync<AttendanceRecord>(
    `SELECT a.*, w.fullName as workerName, w.workerId as workerIdCode
     FROM attendance a LEFT JOIN workers w ON a.workerId = w.id
     ORDER BY a.createdAt DESC`
  );
}

export async function getAttendanceHistory(): Promise<AttendanceRecord[]> {
  if (IS_WEB) return web_getAttendanceHistory();
  const db = await getDb();
  return db.getAllAsync<AttendanceRecord>(
    `SELECT a.*, w.fullName as workerName, w.workerId as workerIdCode
     FROM attendance a LEFT JOIN workers w ON a.workerId = w.id
     ORDER BY a.date DESC, a.time DESC`
  );
}

export async function getSyncQueue(): Promise<SyncRecord[]> {
  if (IS_WEB) return web_getSyncQueue();
  const db = await getDb();
  return db.getAllAsync<SyncRecord>("SELECT * FROM sync_queue ORDER BY createdAt DESC");
}

export async function markSynced(recordId: number): Promise<void> {
  if (IS_WEB) return web_markSynced(recordId);
  const db = await getDb();
  await db.runAsync("UPDATE sync_queue SET status = 'synced' WHERE id = ?", [recordId]);
}

export async function getAppSetting(key: string): Promise<string | null> {
  if (IS_WEB) return web_getAppSetting(key);
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  if (IS_WEB) return web_setAppSetting(key, value);
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [key, value]);
}

export async function getWorkerAttendance(workerId: number): Promise<AttendanceRecord[]> {
  if (IS_WEB) return web_getWorkerAttendance(workerId);
  const db = await getDb();
  return db.getAllAsync<AttendanceRecord>(
    `SELECT a.*, w.fullName as workerName, w.workerId as workerIdCode
     FROM attendance a LEFT JOIN workers w ON a.workerId = w.id
     WHERE a.workerId = ? ORDER BY a.date DESC, a.time DESC`,
    [workerId]
  );
}

export async function getWorkersByPlaza(plazaId: string, status?: WorkerStatus): Promise<Worker[]> {
  if (IS_WEB) return web_getWorkersByPlaza(plazaId, status);
  const db = await getDb();
  if (status) {
    return db.getAllAsync<Worker>("SELECT * FROM workers WHERE plazaId = ? AND status = ? ORDER BY fullName ASC", [plazaId, status]);
  }
  return db.getAllAsync<Worker>("SELECT * FROM workers WHERE plazaId = ? ORDER BY fullName ASC", [plazaId]);
}

export async function getWorkerFaceImageCount(workerId: number): Promise<number> {
  if (IS_WEB) return web_getWorkerFaceImageCount(workerId);
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>("SELECT COUNT(*) as cnt FROM face_images WHERE workerId = ? AND captured = 1", [workerId]);
  return row?.cnt ?? 0;
}

export async function saveFaceImage(entry: Omit<FaceImage, "id" | "createdAt">): Promise<void> {
  if (IS_WEB) return web_saveFaceImage(entry);
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO face_images (workerId, imageType, imagePath, captured) VALUES (?, ?, ?, ?)",
    [entry.workerId, entry.imageType, entry.imagePath ?? null, entry.captured ? 1 : 0]
  );
}

export async function updateWorker(
  id: number,
  fields: Partial<Pick<Worker, "fullName" | "mobile" | "department" | "contractorName" | "employeeType" | "siteLocation">>,
  changedBy: string
): Promise<void> {
  if (IS_WEB) return web_updateWorker(id, fields, changedBy);
  const db = await getDb();
  const original = await db.getFirstAsync<Worker>("SELECT * FROM workers WHERE id = ?", [id]);
  if (!original) throw new Error("Worker not found");
  const updates: string[] = [];
  const values: (string | number)[] = [];
  const fieldMap: Record<string, string> = { fullName: "fullName", mobile: "mobile", department: "department", contractorName: "contractorName", employeeType: "employeeType", siteLocation: "siteLocation" };
  const originalRecord = original as unknown as Record<string, unknown>;
  for (const [key, col] of Object.entries(fieldMap)) {
    const k = key as keyof typeof fields;
    if (fields[k] !== undefined && fields[k] !== originalRecord[key]) {
      updates.push(`${col} = ?`);
      values.push(fields[k] as string);
      await addAuditLog({ workerId: id, action: "update_field", fieldChanged: key, oldValue: String(originalRecord[key] ?? ""), newValue: String(fields[k]), changedBy });
    }
  }
  if (updates.length === 0) return;
  values.push(id);
  await db.runAsync(`UPDATE workers SET ${updates.join(", ")} WHERE id = ?`, values);
}

export async function setWorkerStatus(id: number, status: WorkerStatus, changedBy: string): Promise<void> {
  if (IS_WEB) return web_setWorkerStatus(id, status, changedBy);
  const db = await getDb();
  const original = await db.getFirstAsync<Worker>("SELECT status FROM workers WHERE id = ?", [id]);
  const oldStatus = original?.status ?? "active";
  await db.runAsync("UPDATE workers SET status = ? WHERE id = ?", [status, id]);
  await addAuditLog({ workerId: id, action: "status_change", fieldChanged: "status", oldValue: oldStatus, newValue: status, changedBy });
}

export async function addAuditLog(entry: Omit<AuditLog, "id" | "createdAt">): Promise<void> {
  if (IS_WEB) return web_addAuditLog(entry);
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO audit_log (workerId, action, fieldChanged, oldValue, newValue, changedBy) VALUES (?,?,?,?,?,?)",
    [entry.workerId, entry.action, entry.fieldChanged ?? "", entry.oldValue ?? "", entry.newValue ?? "", entry.changedBy]
  );
}

export async function getWorkerAuditLogs(workerId: number): Promise<AuditLog[]> {
  if (IS_WEB) return web_getWorkerAuditLogs(workerId);
  const db = await getDb();
  return db.getAllAsync<AuditLog>("SELECT * FROM audit_log WHERE workerId = ? ORDER BY createdAt DESC LIMIT 50", [workerId]);
}

export async function getWorkerAttendanceStats(workerId: number): Promise<{ present: number; absent: number; total: number; rate: number }> {
  if (IS_WEB) return web_getWorkerAttendanceStats(workerId);
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: string; cnt: number }>("SELECT status, COUNT(*) as cnt FROM attendance WHERE workerId = ? GROUP BY status", [workerId]);
  let present = 0; let absent = 0;
  for (const r of rows) { if (r.status === "present") present = r.cnt; else if (r.status === "absent") absent = r.cnt; }
  const total = present + absent;
  return { present, absent, total, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
}

export async function getAttendanceStats(): Promise<{ total: number; present: number; absent: number; pending: number }> {
  if (IS_WEB) return web_getAttendanceStats();
  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const rows = await db.getAllAsync<{ status: string; syncStatus: string; cnt: number }>(
    "SELECT status, syncStatus, COUNT(*) as cnt FROM attendance WHERE date = ? GROUP BY status, syncStatus", [today]
  );
  let present = 0; let absent = 0; let pending = 0;
  for (const r of rows) {
    if (r.status === "present") present += r.cnt; else if (r.status === "absent") absent += r.cnt;
    if (r.syncStatus === "pending") pending += r.cnt;
  }
  return { total: present + absent, present, absent, pending };
}

export async function clearAllAppData(): Promise<{ workers: number; attendance: number; syncQueue: number }> {
  if (IS_WEB) return web_clearAllAppData();
  const db = await getDb();
  const wCount = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM workers");
  const aCount = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM attendance");
  const sCount = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM sync_queue");
  await db.execAsync("DELETE FROM face_images; DELETE FROM audit_log; DELETE FROM attendance; DELETE FROM sync_queue; DELETE FROM workers;");
  return { workers: wCount?.c ?? 0, attendance: aCount?.c ?? 0, syncQueue: sCount?.c ?? 0 };
}

export async function clearSyncedRecords(): Promise<number> {
  if (IS_WEB) return web_clearSyncedRecords();
  const db = await getDb();
  const row = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM sync_queue WHERE status = 'synced'");
  const count = row?.c ?? 0;
  await db.execAsync("DELETE FROM sync_queue WHERE status = 'synced'");
  await db.execAsync("DELETE FROM face_images WHERE captured = 0");
  return count;
}

export async function getSyncStats(): Promise<{ pending: number; synced: number; failed: number; lastSync: string | null }> {
  if (IS_WEB) return web_getSyncStats();
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: string; cnt: number }>("SELECT status, COUNT(*) as cnt FROM sync_queue GROUP BY status");
  let pending = 0; let synced = 0; let failed = 0;
  for (const r of rows) { if (r.status === "pending") pending = r.cnt; else if (r.status === "synced") synced = r.cnt; else if (r.status === "failed") failed = r.cnt; }
  const lastRow = await db.getFirstAsync<{ createdAt: string }>("SELECT createdAt FROM sync_queue WHERE status = 'synced' ORDER BY createdAt DESC LIMIT 1");
  return { pending, synced, failed, lastSync: lastRow?.createdAt ?? null };
}

export async function getAttendanceForCSV(): Promise<AttendanceRecord[]> {
  if (IS_WEB) return web_getAttendanceForCSV();
  const db = await getDb();
  return db.getAllAsync<AttendanceRecord>(
    `SELECT a.*, w.fullName as workerName, w.workerId as workerIdCode, w.department, w.contractorName
     FROM attendance a LEFT JOIN workers w ON a.workerId = w.id ORDER BY a.date DESC, a.time DESC`
  );
}

export async function getWeeklyAttendance(): Promise<{ day: string; count: number }[]> {
  if (IS_WEB) return web_getWeeklyAttendance();
  const db = await getDb();
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const result: { day: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dayName = DAY_NAMES[d.getDay()];
    const row = await db.getFirstAsync<{ cnt: number }>("SELECT COUNT(*) as cnt FROM attendance WHERE date = ? AND status = 'present'", [dateStr]);
    result.push({ day: dayName, count: row?.cnt ?? 0 });
  }
  return result;
}
