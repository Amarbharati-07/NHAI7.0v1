import * as SQLite from "expo-sqlite";

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

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("spectraId.db");
    await initDb(db);
  }
  return db;
}

async function initDb(db: SQLite.SQLiteDatabase) {
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

  /* Safe schema migration — add traceability columns if not present */
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
    try { await db.execAsync(sql); } catch { /* column/table already exists */ }
  }

  await seedDummyData(db);
}

async function seedDummyData(db: SQLite.SQLiteDatabase) {
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

export async function insertWorker(
  form: {
    workerId: string; fullName: string; mobile: string;
    department: string; contractorName: string; employeeType: string; siteLocation: string;
    plazaId?: string; operatorId?: string; deviceToken?: string;
  }
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    "INSERT INTO workers (workerId, fullName, mobile, department, contractorName, employeeType, siteLocation, plazaId, operatorId, deviceToken) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [form.workerId, form.fullName, form.mobile, form.department, form.contractorName, form.employeeType, form.siteLocation, form.plazaId ?? "", form.operatorId ?? "", form.deviceToken ?? ""]
  );
  await (await getDb()).runAsync(
    "INSERT INTO sync_queue (recordType, recordId, status) VALUES (?, ?, ?)",
    ["worker", result.lastInsertRowId, "pending"]
  );
  return result.lastInsertRowId;
}

export async function insertAttendance(
  record: {
    workerId: number; date: string; time: string; status?: string; syncStatus?: string;
    plazaId?: string; operatorId?: string; deviceToken?: string;
  }
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    "INSERT INTO attendance (workerId, date, time, status, syncStatus, plazaId, operatorId, deviceToken) VALUES (?,?,?,?,?,?,?,?)",
    [
      record.workerId, record.date, record.time,
      record.status ?? "present", record.syncStatus ?? "pending",
      record.plazaId ?? "", record.operatorId ?? "", record.deviceToken ?? "",
    ]
  );
  return result.lastInsertRowId;
}

export async function getWorkers(): Promise<Worker[]> {
  const db = await getDb();
  return db.getAllAsync<Worker>("SELECT * FROM workers ORDER BY createdAt DESC");
}

export async function getWorkerById(id: number): Promise<Worker | null> {
  const db = await getDb();
  return db.getFirstAsync<Worker>("SELECT * FROM workers WHERE id = ?", [id]);
}

export async function getAttendanceRecords(): Promise<AttendanceRecord[]> {
  const db = await getDb();
  return db.getAllAsync<AttendanceRecord>(
    `SELECT a.*, w.fullName as workerName, w.workerId as workerIdCode
     FROM attendance a
     LEFT JOIN workers w ON a.workerId = w.id
     ORDER BY a.createdAt DESC`
  );
}

export async function getAttendanceHistory(): Promise<AttendanceRecord[]> {
  const db = await getDb();
  return db.getAllAsync<AttendanceRecord>(
    `SELECT a.*, w.fullName as workerName, w.workerId as workerIdCode
     FROM attendance a
     LEFT JOIN workers w ON a.workerId = w.id
     ORDER BY a.date DESC, a.time DESC`
  );
}

export async function getSyncQueue(): Promise<SyncRecord[]> {
  const db = await getDb();
  return db.getAllAsync<SyncRecord>("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY createdAt ASC");
}

export async function markSynced(recordId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sync_queue SET status = 'synced' WHERE id = ?", [recordId]);
}

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
  return row?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [key, value]);
}

export async function getWorkerAttendance(workerId: number): Promise<AttendanceRecord[]> {
  const db = await getDb();
  return db.getAllAsync<AttendanceRecord>(
    `SELECT a.*, w.fullName as workerName, w.workerId as workerIdCode
     FROM attendance a
     LEFT JOIN workers w ON a.workerId = w.id
     WHERE a.workerId = ?
     ORDER BY a.date DESC, a.time DESC`,
    [workerId]
  );
}

export async function getWorkersByPlaza(plazaId: string, status?: WorkerStatus): Promise<Worker[]> {
  const db = await getDb();
  if (status) {
    return db.getAllAsync<Worker>(
      "SELECT * FROM workers WHERE plazaId = ? AND status = ? ORDER BY fullName ASC",
      [plazaId, status]
    );
  }
  return db.getAllAsync<Worker>(
    "SELECT * FROM workers WHERE plazaId = ? ORDER BY fullName ASC",
    [plazaId]
  );
}

export async function getWorkerFaceImageCount(workerId: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM face_images WHERE workerId = ? AND captured = 1",
    [workerId]
  );
  return row?.cnt ?? 0;
}

export async function updateWorker(
  id: number,
  fields: Partial<Pick<Worker, "fullName" | "mobile" | "department" | "contractorName" | "employeeType" | "siteLocation">>,
  changedBy: string
): Promise<void> {
  const db = await getDb();
  const original = await db.getFirstAsync<Worker>("SELECT * FROM workers WHERE id = ?", [id]);
  if (!original) throw new Error("Worker not found");

  const updates: string[] = [];
  const values: (string | number)[] = [];
  const fieldMap: Record<string, string> = {
    fullName: "fullName", mobile: "mobile", department: "department",
    contractorName: "contractorName", employeeType: "employeeType", siteLocation: "siteLocation",
  };
  const originalRecord = original as unknown as Record<string, unknown>;
  for (const [key, col] of Object.entries(fieldMap)) {
    const k = key as keyof typeof fields;
    if (fields[k] !== undefined && fields[k] !== originalRecord[key]) {
      updates.push(`${col} = ?`);
      values.push(fields[k] as string);
      await addAuditLog({
        workerId: id, action: "update_field", fieldChanged: key,
        oldValue: String(originalRecord[key] ?? ""),
        newValue: String(fields[k]),
        changedBy,
      });
    }
  }
  if (updates.length === 0) return;
  values.push(id);
  await db.runAsync(`UPDATE workers SET ${updates.join(", ")} WHERE id = ?`, values);
}

export async function setWorkerStatus(id: number, status: WorkerStatus, changedBy: string): Promise<void> {
  const db = await getDb();
  const original = await db.getFirstAsync<Worker>("SELECT status FROM workers WHERE id = ?", [id]);
  const oldStatus = original?.status ?? "active";
  await db.runAsync("UPDATE workers SET status = ? WHERE id = ?", [status, id]);
  await addAuditLog({
    workerId: id, action: "status_change", fieldChanged: "status",
    oldValue: oldStatus, newValue: status, changedBy,
  });
}

export async function addAuditLog(entry: Omit<AuditLog, "id" | "createdAt">): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "INSERT INTO audit_log (workerId, action, fieldChanged, oldValue, newValue, changedBy) VALUES (?,?,?,?,?,?)",
    [entry.workerId, entry.action, entry.fieldChanged ?? "", entry.oldValue ?? "", entry.newValue ?? "", entry.changedBy]
  );
}

export async function getWorkerAuditLogs(workerId: number): Promise<AuditLog[]> {
  const db = await getDb();
  return db.getAllAsync<AuditLog>(
    "SELECT * FROM audit_log WHERE workerId = ? ORDER BY createdAt DESC LIMIT 50",
    [workerId]
  );
}

export async function getWorkerAttendanceStats(workerId: number): Promise<{ present: number; absent: number; total: number; rate: number }> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ status: string; cnt: number }>(
    "SELECT status, COUNT(*) as cnt FROM attendance WHERE workerId = ? GROUP BY status",
    [workerId]
  );
  let present = 0; let absent = 0;
  for (const r of rows) {
    if (r.status === "present") present = r.cnt;
    else if (r.status === "absent") absent = r.cnt;
  }
  const total = present + absent;
  const rate = total > 0 ? Math.round((present / total) * 100) : 0;
  return { present, absent, total, rate };
}

export async function getAttendanceStats(): Promise<{ total: number; present: number; absent: number; pending: number }> {
  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const rows = await db.getAllAsync<{ status: string; syncStatus: string; cnt: number }>(
    `SELECT status, syncStatus, COUNT(*) as cnt FROM attendance WHERE date = ? GROUP BY status, syncStatus`,
    [today]
  );
  let present = 0; let absent = 0; let pending = 0;
  for (const r of rows) {
    if (r.status === "present")  present  += r.cnt;
    else if (r.status === "absent") absent += r.cnt;
    if (r.syncStatus === "pending") pending += r.cnt;
  }
  const total = present + absent;
  return { total, present, absent, pending };
}
