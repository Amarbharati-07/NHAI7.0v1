import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { getAttendanceForCSV, getWorkers } from "./database";

function esc(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells: (string | number | null | undefined)[]): string {
  return cells.map(esc).join(",");
}

async function shareFile(content: string, filename: string): Promise<void> {
  if (Platform.OS === "web") {
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, filename);
  file.write(content);
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      dialogTitle: "Export Report",
      UTI: "public.comma-separated-values-text",
    });
  }
}

export async function exportAttendanceCSV(
  options: { dateFilter?: string; label?: string } = {}
): Promise<{ success: boolean; error?: string }> {
  try {
    const records = await getAttendanceForCSV();
    const filtered = options.dateFilter
      ? records.filter((r) => r.date === options.dateFilter)
      : records;

    const workers = await getWorkers();
    const workerMap = new Map(workers.map((w) => [w.id!, w]));

    const header = row(
      "Worker ID", "Full Name", "Department", "Plaza ID",
      "Operator ID", "Date", "Time", "Status",
      "Latitude", "Longitude", "Sync Status"
    );

    const dataRows = filtered.map((r) => {
      const w = workerMap.get(r.workerId);
      return row(
        w?.workerId ?? "",
        w?.fullName ?? "",
        w?.department ?? "",
        r.plazaId ?? "",
        r.operatorId ?? "",
        r.date,
        r.time,
        r.status,
        (r as any).latitude ?? "",
        (r as any).longitude ?? "",
        r.syncStatus
      );
    });

    const csv = [header, ...dataRows].join("\n");
    const dateLabel = options.dateFilter ?? new Date().toISOString().split("T")[0];
    const label = options.label ?? "attendance";
    const filename = `${label}_${dateLabel.replace(/-/g, "")}.csv`;

    await shareFile(csv, filename);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function exportWorkersCSV(): Promise<{ success: boolean; error?: string }> {
  try {
    const workers = await getWorkers();
    const header = row(
      "Worker ID", "Full Name", "Mobile", "Department",
      "Employee Type", "Contractor", "Site Location", "Plaza ID", "Status"
    );
    const dataRows = workers.map((w) =>
      row(
        w.workerId, w.fullName, w.mobile, w.department,
        w.employeeType, w.contractorName, w.siteLocation,
        w.plazaId ?? "", w.status ?? "active"
      )
    );
    const csv = [header, ...dataRows].join("\n");
    const filename = `workers_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.csv`;
    await shareFile(csv, filename);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function exportWeeklyCSV(): Promise<{ success: boolean; error?: string }> {
  try {
    const records = await getAttendanceForCSV();
    const workers = await getWorkers();
    const workerMap = new Map(workers.map((w) => [w.id!, w]));

    const since = new Date();
    since.setDate(since.getDate() - 6);
    const sinceStr = since.toISOString().split("T")[0];
    const filtered = records.filter((r) => r.date >= sinceStr);

    const header = row(
      "Worker ID", "Full Name", "Department", "Plaza ID",
      "Date", "Time", "Status", "Latitude", "Longitude"
    );
    const dataRows = filtered.map((r) => {
      const w = workerMap.get(r.workerId);
      return row(
        w?.workerId ?? "", w?.fullName ?? "", w?.department ?? "",
        r.plazaId ?? "", r.date, r.time, r.status,
        (r as any).latitude ?? "", (r as any).longitude ?? ""
      );
    });

    const csv = [header, ...dataRows].join("\n");
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
    await shareFile(csv, `weekly_attendance_${today}.csv`);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
