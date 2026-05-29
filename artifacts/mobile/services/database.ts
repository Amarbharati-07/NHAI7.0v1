import * as SQLite from "expo-sqlite";

export interface Worker {
  id?: number;
  workerId: string;
  fullName: string;
  mobile: string;
  department: string;
  contractorName: string;
  employeeType: string;
  siteLocation: string;
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
  await seedDummyData(db);
}

async function seedDummyData(db: SQLite.SQLiteDatabase) {
  const existing = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM workers");
  if (existing && existing.count > 0) return;

  const workers = [
    { workerId: "WRK001", fullName: "Rajesh Kumar", mobile: "9876543210", department: "Civil", contractorName: "ABC Constructions", employeeType: "Contract", siteLocation: "Site-A Delhi" },
    { workerId: "WRK002", fullName: "Priya Sharma", mobile: "9876543211", department: "Electrical", contractorName: "XYZ Electricals", employeeType: "Permanent", siteLocation: "Site-B Mumbai" },
    { workerId: "WRK003", fullName: "Amit Singh", mobile: "9876543212", department: "Plumbing", contractorName: "ABC Constructions", employeeType: "Contract", siteLocation: "Site-A Delhi" },
    { workerId: "WRK004", fullName: "Sunita Verma", mobile: "9876543213", department: "Civil", contractorName: "DEF Projects", employeeType: "Temporary", siteLocation: "Site-C Pune" },
    { workerId: "WRK005", fullName: "Mohan Lal", mobile: "9876543214", department: "Security", contractorName: "GHI Security", employeeType: "Contract", siteLocation: "Site-A Delhi" },
    { workerId: "WRK006", fullName: "Kavitha Nair", mobile: "9876543215", department: "Admin", contractorName: "Internal", employeeType: "Permanent", siteLocation: "Site-B Mumbai" },
  ];

  for (const w of workers) {
    await db.runAsync(
      "INSERT OR IGNORE INTO workers (workerId, fullName, mobile, department, contractorName, employeeType, siteLocation) VALUES (?,?,?,?,?,?,?)",
      [w.workerId, w.fullName, w.mobile, w.department, w.contractorName, w.employeeType, w.siteLocation]
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const dayBefore = new Date(Date.now() - 172800000).toISOString().split("T")[0];

  const attendanceData = [
    { workerId: 1, date: today, time: "08:32", status: "present", syncStatus: "pending" },
    { workerId: 2, date: today, time: "08:45", status: "present", syncStatus: "pending" },
    { workerId: 3, date: today, time: "09:10", status: "present", syncStatus: "synced" },
    { workerId: 4, date: today, time: "00:00", status: "absent", syncStatus: "synced" },
    { workerId: 5, date: today, time: "07:58", status: "present", syncStatus: "pending" },
    { workerId: 1, date: yesterday, time: "08:15", status: "present", syncStatus: "synced" },
    { workerId: 2, date: yesterday, time: "08:30", status: "present", syncStatus: "synced" },
    { workerId: 3, date: yesterday, time: "00:00", status: "absent", syncStatus: "synced" },
    { workerId: 4, date: yesterday, time: "09:00", status: "present", syncStatus: "synced" },
    { workerId: 5, date: dayBefore, time: "08:20", status: "present", syncStatus: "synced" },
    { workerId: 6, date: dayBefore, time: "00:00", status: "absent", syncStatus: "synced" },
  ];

  for (const a of attendanceData) {
    await db.runAsync(
      "INSERT INTO attendance (workerId, date, time, status, syncStatus) VALUES (?,?,?,?,?)",
      [a.workerId, a.date, a.time, a.status, a.syncStatus]
    );
  }

  await db.runAsync("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", ["darkMode", "true"]);
  await db.runAsync("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", ["lastSync", "Never"]);
  await db.runAsync("INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)", ["appVersion", "1.0.0"]);
}

export async function getAllWorkers(): Promise<Worker[]> {
  const db = await getDb();
  return db.getAllAsync<Worker>("SELECT * FROM workers ORDER BY fullName");
}

export async function getWorkerById(id: number): Promise<Worker | null> {
  const db = await getDb();
  return db.getFirstAsync<Worker>("SELECT * FROM workers WHERE id = ?", [id]);
}

export async function insertWorker(worker: Omit<Worker, "id" | "createdAt">): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    "INSERT INTO workers (workerId, fullName, mobile, department, contractorName, employeeType, siteLocation) VALUES (?,?,?,?,?,?,?)",
    [worker.workerId, worker.fullName, worker.mobile, worker.department, worker.contractorName, worker.employeeType, worker.siteLocation]
  );
  return result.lastInsertRowId;
}

export async function getAttendanceStats(): Promise<{ total: number; present: number; absent: number; pending: number }> {
  const db = await getDb();
  const today = new Date().toISOString().split("T")[0];
  const total = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM workers");
  const present = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = 'present'", [today]);
  const absent = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = 'absent'", [today]);
  const pending = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM attendance WHERE syncStatus = 'pending'");
  return {
    total: total?.count ?? 0,
    present: present?.count ?? 0,
    absent: absent?.count ?? 0,
    pending: pending?.count ?? 0,
  };
}

export async function getAttendanceHistory(filter?: { date?: string; workerId?: string; name?: string }): Promise<AttendanceRecord[]> {
  const db = await getDb();
  let query = `
    SELECT a.*, w.fullName as workerName, w.workerId as workerIdCode
    FROM attendance a
    JOIN workers w ON a.workerId = w.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];
  if (filter?.date) { query += " AND a.date = ?"; params.push(filter.date); }
  if (filter?.workerId) { query += " AND w.workerId LIKE ?"; params.push(`%${filter.workerId}%`); }
  if (filter?.name) { query += " AND w.fullName LIKE ?"; params.push(`%${filter.name}%`); }
  query += " ORDER BY a.createdAt DESC LIMIT 100";
  return db.getAllAsync<AttendanceRecord>(query, params);
}

export async function insertAttendance(record: Omit<AttendanceRecord, "id" | "createdAt">): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    "INSERT INTO attendance (workerId, date, time, status, syncStatus) VALUES (?,?,?,?,?)",
    [record.workerId, record.date, record.time, record.status, record.syncStatus]
  );
  await db.runAsync("INSERT INTO sync_queue (recordType, recordId, status) VALUES (?, ?, ?)", ["attendance", result.lastInsertRowId, "pending"]);
  return result.lastInsertRowId;
}

export async function getWorkerAttendance(workerId: number): Promise<AttendanceRecord[]> {
  const db = await getDb();
  return db.getAllAsync<AttendanceRecord>("SELECT * FROM attendance WHERE workerId = ? ORDER BY date DESC", [workerId]);
}

export async function getFaceImages(workerId: number): Promise<FaceImage[]> {
  const db = await getDb();
  return db.getAllAsync<FaceImage>("SELECT * FROM face_images WHERE workerId = ?", [workerId]);
}

export async function saveFaceImage(image: Omit<FaceImage, "id" | "createdAt">): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    "INSERT OR REPLACE INTO face_images (workerId, imageType, imagePath, captured) VALUES (?,?,?,?)",
    [image.workerId, image.imageType, image.imagePath, image.captured ? 1 : 0]
  );
  return result.lastInsertRowId;
}

export async function getSyncQueue(): Promise<SyncRecord[]> {
  const db = await getDb();
  return db.getAllAsync<SyncRecord>("SELECT * FROM sync_queue ORDER BY createdAt DESC");
}

export async function markSynced(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE sync_queue SET status = 'synced' WHERE id = ?", [id]);
}

export async function getWeeklyAttendance(): Promise<{ day: string; count: number }[]> {
  const db = await getDb();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().split("T")[0];
    const dayName = d.toLocaleDateString("en", { weekday: "short" });
    const row = await db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM attendance WHERE date = ? AND status = 'present'",
      [dateStr]
    );
    days.push({ day: dayName, count: row?.count ?? 0 });
  }
  return days;
}
