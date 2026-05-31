import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getSyncQueue,
  markSynced,
  getWorkerById,
  getAttendanceById,
} from "./database";
import { fetchAwsStatus, runPurge, getLastPurge, type AwsStatus } from "./AwsSyncService";
import { getApiBase } from "./apiConfig";
import { bootstrapOperatorOfflineData } from "./offlineBootstrapService";

export type { AwsStatus };

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  awsUploaded: boolean;
  lastS3Key: string | null;
  awsStatus: AwsStatus | null;
  isPurging: boolean;
  lastPurgedAt: string | null;
  purgedTotal: number;
}

export interface SyncResult {
  synced: number;
  errors: number;
  awsUploaded: boolean;
  s3Key?: string;
  purgedAttendance: number;
}

type SyncListener = (state: SyncState) => void;

export { getApiBase };

class SyncService {
  private listeners = new Set<SyncListener>();
  private state: SyncState = {
    isOnline: false,
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
    awsUploaded: false,
    lastS3Key: null,
    awsStatus: null,
    isPurging: false,
    lastPurgedAt: null,
    purgedTotal: 0,
  };
  private netInfoUnsub: (() => void) | null = null;

  private async onConnectivityRestored() {
    try {
      const stored = await AsyncStorage.getItem("@spectra_user");
      if (stored) {
        const u = JSON.parse(stored) as { role?: string; userId?: string };
        if (u.role === "operator" && u.userId) {
          await bootstrapOperatorOfflineData(u.userId);
        }
      }
    } catch {
      /* non-fatal */
    }
    this.loadAwsStatus();
    this.sync();
  }

  start() {
    NetInfo.fetch().then((s) => {
      const online = !!s.isConnected && !!s.isInternetReachable;
      this.setState({ isOnline: online });
      if (online) {
        void this.onConnectivityRestored();
      }
    });

    this.netInfoUnsub = NetInfo.addEventListener((s) => {
      const wasOnline = this.state.isOnline;
      const online = !!s.isConnected && !!s.isInternetReachable;
      this.setState({ isOnline: online });
      if (!wasOnline && online) {
        void this.onConnectivityRestored();
      }
    });

    this.refreshPendingCount();
    this.loadPersistedPurgeStats();
  }

  stop() {
    this.netInfoUnsub?.();
    this.netInfoUnsub = null;
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): SyncState {
    return this.state;
  }

  async loadAwsStatus() {
    try {
      const awsStatus = await fetchAwsStatus();
      this.setState({ awsStatus });
    } catch {}
  }

  async refreshPendingCount() {
    try {
      const queue = await getSyncQueue();
      const pending = queue.filter((r) => r.status === "pending").length;
      this.setState({ pendingCount: pending });
    } catch {}
  }

  private async loadPersistedPurgeStats() {
    try {
      const { lastPurgedAt, purgedTotal } = await getLastPurge();
      this.setState({ lastPurgedAt, purgedTotal });
    } catch {}
  }

  private setState(partial: Partial<SyncState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.state));
  }

  async sync(): Promise<SyncResult> {
    if (this.state.isSyncing) return { synced: 0, errors: 0, awsUploaded: false, purgedAttendance: 0 };
    if (!this.state.isOnline) return { synced: 0, errors: 0, awsUploaded: false, purgedAttendance: 0 };

    this.setState({ isSyncing: true, lastError: null });

    try {
      const queue = await getSyncQueue();
      const pending = queue.filter((r) => r.status === "pending");

      this.setState({ pendingCount: pending.length });

      if (pending.length === 0) {
        this.setState({ isSyncing: false });
        return { synced: 0, errors: 0, awsUploaded: false, purgedAttendance: 0 };
      }

      const workers: object[] = [];
      const attendance: object[] = [];

      for (const rec of pending) {
        if (rec.recordType === "worker") {
          const w = await getWorkerById(rec.recordId);
          if (w) workers.push({ ...w, syncQueueId: rec.id });
        } else if (rec.recordType === "attendance") {
          const a = await getAttendanceById(rec.recordId);
          if (a) {
            attendance.push({
              mobileWorkerId: a.workerId,
              workerIdCode: a.workerIdCode ?? "",
              date: a.date,
              time: a.time,
              status: a.status,
              plazaId: a.plazaId ?? "",
              operatorId: a.operatorId ?? "",
              deviceToken: a.deviceToken ?? "",
              latitude: (a as any).latitude != null ? String((a as any).latitude) : "",
              longitude: (a as any).longitude != null ? String((a as any).longitude) : "",
              syncQueueId: rec.id,
            });
          }
        }
      }

      const firstAttendance = attendance[0] as any;
      const firstWorker = workers[0] as any;

      const response = await fetch(`${getApiBase()}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workers,
          attendance,
          deviceToken: firstAttendance?.deviceToken ?? firstWorker?.deviceToken ?? "",
          plazaId: firstAttendance?.plazaId ?? firstWorker?.plazaId ?? "",
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      const responseData = await response.json() as {
        success: boolean;
        synced: { workers: number; attendance: number };
        errors: string[];
        aws?: { uploaded: boolean; s3Key?: string; bucket?: string; error?: string };
      };

      for (const rec of pending) {
        await markSynced(rec.id!);
      }

      const awsUploaded = responseData.aws?.uploaded === true;
      const lastS3Key = responseData.aws?.s3Key ?? null;
      const now = new Date().toISOString();

      this.setState({
        isSyncing: false,
        pendingCount: 0,
        lastSyncedAt: now,
        lastError: null,
        awsUploaded,
        lastS3Key,
      });

      this.setState({ isPurging: true });
      let purgedAttendance = 0;
      try {
        const purgeResult = await runPurge();
        purgedAttendance = purgeResult.purgedAttendance;
        this.setState({
          isPurging: false,
          lastPurgedAt: purgeResult.purgedAt,
          purgedTotal: this.state.purgedTotal + purgeResult.purgedAttendance,
        });
      } catch {
        this.setState({ isPurging: false });
      }

      return { synced: pending.length, errors: 0, awsUploaded, s3Key: lastS3Key ?? undefined, purgedAttendance };
    } catch (e) {
      const msg = (e as Error).message ?? "Unknown error";
      this.setState({ isSyncing: false, lastError: msg });
      await this.refreshPendingCount();
      return { synced: 0, errors: 1, awsUploaded: false, purgedAttendance: 0 };
    }
  }
}

export const syncService = new SyncService();
