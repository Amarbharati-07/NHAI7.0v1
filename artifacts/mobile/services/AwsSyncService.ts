import { clearSyncedRecords, getAppSetting, setAppSetting, purgeAttendanceSynced } from "./database";
import { apiFetch, resolveApiBase } from "./apiConfig";

export interface AwsStatus {
  configured: boolean;
  bucket?: string;
  region?: string;
}

export interface PurgeResult {
  purgedAttendance: number;
  purgedImages: number;
  purgedAt: string;
}

export async function fetchAwsStatus(): Promise<AwsStatus> {
  try {
    const base = await resolveApiBase();
    const resp = await apiFetch(`${base}/sync/aws-status`, undefined, 5000);
    if (!resp.ok) return { configured: false };
    return (await resp.json()) as AwsStatus;
  } catch {
    return { configured: false };
  }
}

export async function runPurge(): Promise<PurgeResult> {
  await clearSyncedRecords();
  const { purgedAttendance, purgedImages } = await purgeAttendanceSynced();
  const purgedAt = new Date().toISOString();

  await setAppSetting("lastPurgedAt", purgedAt);

  const prevTotal = parseInt((await getAppSetting("purgedTotal")) ?? "0", 10);
  await setAppSetting("purgedTotal", String(prevTotal + purgedAttendance));

  return { purgedAttendance, purgedImages, purgedAt };
}

export async function getLastPurge(): Promise<{ lastPurgedAt: string | null; purgedTotal: number }> {
  const lastPurgedAt = await getAppSetting("lastPurgedAt");
  const purgedTotal = parseInt((await getAppSetting("purgedTotal")) ?? "0", 10);
  return { lastPurgedAt, purgedTotal };
}
