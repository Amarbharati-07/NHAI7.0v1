import { Platform } from "react-native";
import type { AuthUser } from "@/types/auth";
import { apiGetJson, isApiConfigured } from "./apiConfig";
import { initDatabase, upsertWorkersFromServer, type WorkerStatus } from "./database";
import {
  ensureOperatorAllocationFromBootstrap,
  getOrCreateDeviceToken,
  verifyDevice,
} from "./deviceService";
import { syncPlazaGeofenceFromUser } from "./locationService";
import { updateOfflineProfile } from "./offlineAuthService";

export interface BootstrapWorker {
  workerId: string;
  fullName: string;
  mobile?: string;
  department?: string;
  contractorName?: string;
  employeeType?: string;
  siteLocation?: string;
  plazaId?: string;
  operatorId?: string;
  deviceToken?: string;
  status?: string;
}

export interface BootstrapDevice {
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  deviceType: string;
  deviceToken?: string;
  plazaName: string;
  status: string;
}

interface BootstrapResponse {
  operator: AuthUser;
  workers: BootstrapWorker[];
  device: BootstrapDevice | null;
}

/**
 * Pull operator workers + device assignment from API into local SQLite / AsyncStorage.
 * Safe to call on every online login and app resume.
 */
export async function bootstrapOperatorOfflineData(
  userId: string,
): Promise<AuthUser | null> {
  if (!isApiConfigured() || Platform.OS === "web") return null;

  try {
    console.info("[offlineBootstrap] refresh start", { userId: userId.toUpperCase() });
    const localDeviceToken = await getOrCreateDeviceToken();
    const data = await apiGetJson<BootstrapResponse>(
      `operators/${encodeURIComponent(userId.toUpperCase())}/bootstrap?deviceToken=${encodeURIComponent(localDeviceToken)}`,
    );
    console.info("BOOTSTRAP_RESPONSE", {
      userId: data.operator.userId,
      plazaId: data.operator.plazaId ?? "",
      plazaName: data.operator.plazaName ?? "",
      hasDevice: Boolean(data.device),
      workerCount: data.workers.length,
    });

    await initDatabase();
    await upsertWorkersFromServer(
      data.workers.map((w) => ({
        workerId: w.workerId,
        fullName: w.fullName,
        mobile: w.mobile ?? "",
        department: w.department ?? "",
        contractorName: w.contractorName ?? "",
        employeeType: w.employeeType ?? "",
        siteLocation: w.siteLocation ?? "",
        plazaId: w.plazaId ?? "",
        operatorId: w.operatorId ?? "",
        deviceToken: w.deviceToken ?? "",
        status: (w.status === "inactive" || w.status === "transferred"
          ? w.status
          : "active") as WorkerStatus,
      })),
    );
    const allocation = await ensureOperatorAllocationFromBootstrap(
      {
        userId: data.operator.userId,
        name: data.operator.name,
        plazaId: data.operator.plazaId ?? "",
        plazaName: data.operator.plazaName ?? "Unassigned",
        loginCount: data.operator.loginCount,
      },
      data.device,
      localDeviceToken,
    );

    const verification = await verifyDevice(data.operator.userId);
    const merged: AuthUser = {
      ...data.operator,
      plazaId: verification.plazaId || data.operator.plazaId,
      plazaName: verification.plazaName || data.operator.plazaName,
      allocatedDeviceId: verification.deviceId,
      deviceToken: localDeviceToken,
      isDeviceAuthorized: verification.authorized,
      deviceVerifyReason: verification.reason,
    };

    await syncPlazaGeofenceFromUser(merged);
    await updateOfflineProfile(userId, merged);
    console.info("[offlineBootstrap] refresh success", {
      userId: merged.userId,
      plazaId: merged.plazaId ?? "",
      deviceId: merged.allocatedDeviceId ?? "",
      authorized: merged.isDeviceAuthorized,
      allocationId: allocation?.id ?? "",
    });
    return merged;
  } catch (err) {
    console.warn("[offlineBootstrap] failed — using cached local data:", err);
    return null;
  }
}
