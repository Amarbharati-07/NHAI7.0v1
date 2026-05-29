import NetInfo from "@react-native-community/netinfo";
import {
  getSyncQueue,
  markSynced,
  clearSyncedRecords,
  getWorkerById,
  getAttendanceById,
} from "./database";

export interface SyncState {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface SyncResult {
  synced: number;
  errors: number;
}

type SyncListener = (state: SyncState) => void;

function getApiBaseUrl(): string {
  const domain = process.env["EXPO_PUBLIC_DOMAIN"];
  if (domain) return `https://${domain}:3000/api`;
  return "http://localhost:3000/api";
}

class SyncService {
  private listeners = new Set<SyncListener>();
  private state: SyncState = {
    isOnline: false,
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    lastError: null,
  };
  private netInfoUnsub: (() => void) | null = null;

  start() {
    NetInfo.fetch().then((s) => {
      const online = !!s.isConnected && !!s.isInternetReachable;
      this.setState({ isOnline: online });
      if (online) this.sync();
    });

    this.netInfoUnsub = NetInfo.addEventListener((s) => {
      const wasOnline = this.state.isOnline;
      const online = !!s.isConnected && !!s.isInternetReachable;
      this.setState({ isOnline: online });
      if (!wasOnline && online) {
        this.sync();
      }
    });

    this.refreshPendingCount();
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

  async refreshPendingCount() {
    try {
      const queue = await getSyncQueue();
      const pending = queue.filter((r) => r.status === "pending").length;
      this.setState({ pendingCount: pending });
    } catch {}
  }

  private setState(partial: Partial<SyncState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.state));
  }

  async sync(): Promise<SyncResult> {
    if (this.state.isSyncing) return { synced: 0, errors: 0 };
    if (!this.state.isOnline) return { synced: 0, errors: 0 };

    this.setState({ isSyncing: true, lastError: null });

    try {
      const queue = await getSyncQueue();
      const pending = queue.filter((r) => r.status === "pending");

      this.setState({ pendingCount: pending.length });

      if (pending.length === 0) {
        this.setState({ isSyncing: false });
        return { synced: 0, errors: 0 };
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

      const response = await fetch(`${getApiBaseUrl()}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workers, attendance }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }

      for (const rec of pending) {
        await markSynced(rec.id!);
      }

      await clearSyncedRecords();

      const now = new Date().toISOString();
      this.setState({
        isSyncing: false,
        pendingCount: 0,
        lastSyncedAt: now,
        lastError: null,
      });

      return { synced: pending.length, errors: 0 };
    } catch (e) {
      const msg = (e as Error).message ?? "Unknown error";
      this.setState({ isSyncing: false, lastError: msg });
      await this.refreshPendingCount();
      return { synced: 0, errors: 1 };
    }
  }
}

export const syncService = new SyncService();
