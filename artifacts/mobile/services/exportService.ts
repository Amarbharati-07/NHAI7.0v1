import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { clearAllAppData, getDb, getAttendanceForCSV } from "./database";

const EXPORT_DIR_KEY = "@spectra_export_directory_uri";

type DbRow = Record<string, unknown>;

export interface BackupPayload {
  _meta: {
    app: string;
    version: string;
    build: string;
    backupDate: string;
    schema: string;
    records: Record<string, number>;
  };
  data: {
    workers: DbRow[];
    attendance: DbRow[];
    syncQueue: DbRow[];
    appSettings: DbRow[];
    faceImages: DbRow[];
    faceEmbeddings: DbRow[];
    auditLog: DbRow[];
  };
  storage: {
    notifications: string | null;
    autoSync: string | null;
    themeMode: string | null;
    registeredDevices: string | null;
    allocations: string | null;
  };
}

export interface ExportResult {
  filename: string;
  uri: string;
  savedToDevice: boolean;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

async function ensureAndroidExportDirectory(): Promise<string | null> {
  const saved = await AsyncStorage.getItem(EXPORT_DIR_KEY);
  if (saved) return saved;

  const initialUri = FileSystem.StorageAccessFramework.getUriForDirectoryInRoot("Download");
  const result = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
  if (!result.granted) return null;

  await AsyncStorage.setItem(EXPORT_DIR_KEY, result.directoryUri);
  return result.directoryUri;
}

async function writePortableFile(
  filename: string,
  content: string,
  mimeType: string,
  dialogTitle: string,
): Promise<ExportResult> {
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { filename, uri: url, savedToDevice: false };
  }

  if (Platform.OS === "android") {
    try {
      const dirUri = await ensureAndroidExportDirectory();
      if (dirUri) {
        const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
          dirUri,
          stripExtension(filename),
          mimeType,
        );
        await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, content);
        return { filename, uri: fileUri, savedToDevice: true };
      }
    } catch {
      // Fall back to a temp file and share sheet below.
    }
  }

  const file = new File(Paths.document, filename);
  file.write(content);
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(file.uri, {
      mimeType,
      dialogTitle,
    });
  }
  return { filename, uri: file.uri, savedToDevice: false };
}

async function readTable(db: Awaited<ReturnType<typeof getDb>>, table: string): Promise<DbRow[]> {
  return db.getAllAsync<DbRow>(`SELECT * FROM ${table}`);
}

export async function buildBackupPayload(): Promise<BackupPayload> {
  const db = await getDb();
  const [workers, attendance, syncQueue, appSettings, faceImages, faceEmbeddings, auditLog] = await Promise.all([
    readTable(db, "workers"),
    readTable(db, "attendance"),
    readTable(db, "sync_queue"),
    readTable(db, "app_settings"),
    readTable(db, "face_images"),
    readTable(db, "face_embeddings"),
    readTable(db, "audit_log"),
  ]);

  const [notifications, autoSync, themeMode, registeredDevices, allocations] = await Promise.all([
    AsyncStorage.getItem("@spectra_notifications"),
    AsyncStorage.getItem("@spectra_auto_sync"),
    AsyncStorage.getItem("@spectra_theme_mode"),
    AsyncStorage.getItem("@spectra_registered_devices"),
    AsyncStorage.getItem("@spectra_allocations"),
  ]);

  const records = {
    workers: workers.length,
    attendance: attendance.length,
    syncQueue: syncQueue.length,
    appSettings: appSettings.length,
    faceImages: faceImages.length,
    faceEmbeddings: faceEmbeddings.length,
    auditLog: auditLog.length,
  };

  return {
    _meta: {
      app: "SpectraID",
      version: "1.0.0",
      build: "2025.05.29",
      backupDate: new Date().toISOString(),
      schema: "backup-v1",
      records,
    },
    data: { workers, attendance, syncQueue, appSettings, faceImages, faceEmbeddings, auditLog },
    storage: {
      notifications,
      autoSync,
      themeMode,
      registeredDevices,
      allocations,
    },
  };
}

export async function exportDatabaseBackup(): Promise<ExportResult> {
  const payload = await buildBackupPayload();
  const filename = `spectraID_backup_${new Date().toISOString().split("T")[0]}.json`;
  return writePortableFile(filename, JSON.stringify(payload, null, 2), "application/json", "Save Backup");
}

async function resetSqliteSequences(db: Awaited<ReturnType<typeof getDb>>) {
  try {
    await db.execAsync("DELETE FROM sqlite_sequence WHERE name IN ('workers','attendance','sync_queue','app_settings','face_images','face_embeddings','audit_log')");
  } catch {
    // ignore
  }
}

async function insertRows(
  db: Awaited<ReturnType<typeof getDb>>,
  table: string,
  rows: DbRow[],
  columns: string[],
  preserveId = true,
) {
  for (const row of rows) {
    const selectedCols = preserveId && "id" in row ? ["id", ...columns] : columns;
    const values = selectedCols.map((col) => {
      const value = row[col];
      return value === undefined ? null : (value as string | number | boolean | Uint8Array | null);
    });
    const placeholders = selectedCols.map(() => "?").join(",");
    await db.runAsync(
      `INSERT OR REPLACE INTO ${table} (${selectedCols.join(",")}) VALUES (${placeholders})`,
      values,
    );
  }
}

export async function restoreDatabaseBackupFromJson(json: string): Promise<{
  workers: number;
  attendance: number;
  syncQueue: number;
  faceImages: number;
  faceEmbeddings: number;
  auditLog: number;
}> {
  const parsed = JSON.parse(json) as BackupPayload;
  if (!parsed?._meta || !parsed.data) {
    throw new Error("Invalid backup file");
  }

  const db = await getDb();
  await clearAllAppData();
  await db.execAsync("DELETE FROM app_settings;");
  await db.execAsync("PRAGMA foreign_keys = OFF;");

  await insertRows(db, "workers", parsed.data.workers ?? [], [
    "workerId",
    "fullName",
    "mobile",
    "department",
    "contractorName",
    "employeeType",
    "siteLocation",
    "plazaId",
    "operatorId",
    "deviceToken",
    "status",
    "registrationAt",
    "syncStatus",
    "embeddingStatus",
    "createdAt",
  ]);
  await insertRows(db, "attendance", parsed.data.attendance ?? [], [
    "workerId",
    "date",
    "time",
    "status",
    "syncStatus",
    "plazaId",
    "operatorId",
    "deviceToken",
    "latitude",
    "longitude",
    "createdAt",
  ]);
  await insertRows(db, "sync_queue", parsed.data.syncQueue ?? [], [
    "recordType",
    "recordId",
    "status",
    "createdAt",
  ]);
  await insertRows(db, "app_settings", parsed.data.appSettings ?? [], [
    "key",
    "value",
  ], false);
  await insertRows(db, "face_images", parsed.data.faceImages ?? [], [
    "workerId",
    "imageType",
    "imagePath",
    "captured",
    "createdAt",
  ]);
  await insertRows(db, "face_embeddings", parsed.data.faceEmbeddings ?? [], [
    "workerId",
    "workerIdCode",
    "embedding",
    "pose",
    "modelVersion",
    "createdAt",
  ]);
  await insertRows(db, "audit_log", parsed.data.auditLog ?? [], [
    "workerId",
    "action",
    "fieldChanged",
    "oldValue",
    "newValue",
    "changedBy",
    "createdAt",
  ]);

  await db.execAsync("PRAGMA foreign_keys = ON;");
  await resetSqliteSequences(db);

  await AsyncStorage.multiRemove([
    "@spectra_notifications",
    "@spectra_auto_sync",
    "@spectra_theme_mode",
    "@spectra_registered_devices",
    "@spectra_allocations",
  ]);
  await AsyncStorage.multiSet([
    ["@spectra_notifications", parsed.storage.notifications ?? "true"],
    ["@spectra_auto_sync", parsed.storage.autoSync ?? "false"],
    ["@spectra_theme_mode", parsed.storage.themeMode ?? "light"],
    ["@spectra_registered_devices", parsed.storage.registeredDevices ?? "[]"],
    ["@spectra_allocations", parsed.storage.allocations ?? "[]"],
  ]);

  return {
    workers: parsed.data.workers?.length ?? 0,
    attendance: parsed.data.attendance?.length ?? 0,
    syncQueue: parsed.data.syncQueue?.length ?? 0,
    faceImages: parsed.data.faceImages?.length ?? 0,
    faceEmbeddings: parsed.data.faceEmbeddings?.length ?? 0,
    auditLog: parsed.data.auditLog?.length ?? 0,
  };
}

export async function exportAttendanceCsvFile(): Promise<ExportResult> {
  const records = await getAttendanceForCSV();
  const header = [
    "Worker ID",
    "Worker Name",
    "Department",
    "Contractor",
    "Date",
    "Time",
    "Status",
    "Sync Status",
    "Plaza ID",
    "Operator ID",
  ].join(",");
  const rows = records.map((r) => [
    csvEscape(r.workerIdCode ?? ""),
    csvEscape((r as any).workerName ?? ""),
    csvEscape((r as any).department ?? ""),
    csvEscape((r as any).contractorName ?? ""),
    csvEscape(r.date),
    csvEscape(r.time),
    csvEscape(r.status),
    csvEscape(r.syncStatus),
    csvEscape(r.plazaId ?? ""),
    csvEscape(r.operatorId ?? ""),
  ].join(","));

  const csv = [header, ...rows].join("\n");
  const filename = `spectraID_attendance_${new Date().toISOString().split("T")[0]}.csv`;
  return writePortableFile(filename, csv, "text/csv", "Export CSV");
}

export async function exportDebugLogsFile(lines: string[]): Promise<ExportResult> {
  const text = lines.join("\n");
  const filename = `spectraID_debug_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  return writePortableFile(filename, text, "text/plain", "Export Debug Logs");
}
