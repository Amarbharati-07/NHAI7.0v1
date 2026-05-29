import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TollPlaza, AdminOperator, SecurityEvent, AuditLog } from "./adminData";
import { getApiBase } from "./SyncService";

const PLAZAS_KEY    = "@spectra_plazas_v4";
const OPERATORS_KEY = "@spectra_operators_v4";
const SEEDED_KEY    = "@spectra_admin_seeded_v4";

/* ─── API helpers ─── */

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/${path}`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function apiPost<T>(path: string, body: object): Promise<T | null> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function apiPut(path: string, body: object): Promise<boolean> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function apiDelete(path: string): Promise<boolean> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/${path}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ─── Row normalisation — API shape → app interface ─── */

function normalisePlaza(p: any): TollPlaza {
  return {
    id:              p.plazaId ?? p.id ?? "",
    name:            p.name ?? "",
    route:           p.route ?? "",
    location:        p.location ?? "",
    operatorId:      p.operatorId ?? "",
    operatorName:    p.operatorName ?? "Unassigned",
    workerCount:     p.workerCount ?? 0,
    activeDevices:   p.activeDevices ?? 0,
    attendanceToday: p.attendanceToday ?? 0,
    attendancePct:   p.attendancePct ?? 0,
    status:          (p.status as TollPlaza["status"]) ?? "inactive",
    lastSync:        p.lastSync ?? "Never",
    createdAt:       p.createdAt ? new Date(p.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
  };
}

function normaliseOperator(o: any): AdminOperator {
  return {
    id:          o.userId ?? o.id ?? "",
    userId:      o.userId ?? o.id ?? "",
    name:        o.name ?? "",
    mobile:      o.mobile ?? "",
    email:       o.email ?? "",
    plazaId:     o.plazaId ?? "",
    plazaName:   o.plazaName ?? "Unassigned",
    status:      (o.status as AdminOperator["status"]) ?? "pending",
    lastLogin:   o.lastLogin ?? "Never",
    loginCount:  o.loginCount ?? 0,
    deviceCount: o.deviceCount ?? 0,
    createdAt:   o.createdAt ? new Date(o.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
  };
}

/* ─── Seed (used only when no API + no cache) ─── */

const SEED_PLAZAS: TollPlaza[] = [
  { id: "PLZ001", name: "NH-48 Gurugram Plaza", route: "NH-48", location: "Gurugram, Haryana",  operatorId: "OPR001", operatorName: "Rajan Mehta",  workerCount: 32, activeDevices: 2, attendanceToday: 30, attendancePct: 94, status: "active",      lastSync: "10 mins ago", createdAt: "2024-01-15" },
  { id: "PLZ002", name: "NH-8 Manesar Plaza",   route: "NH-8",  location: "Manesar, Haryana",   operatorId: "OPR002", operatorName: "Kavita Joshi", workerCount: 28, activeDevices: 2, attendanceToday: 24, attendancePct: 86, status: "active",      lastSync: "25 mins ago", createdAt: "2024-02-01" },
  { id: "PLZ003", name: "NH-44 Panipat Plaza",  route: "NH-44", location: "Panipat, Haryana",   operatorId: "OPR003", operatorName: "Arun Patel",   workerCount: 25, activeDevices: 1, attendanceToday: 23, attendancePct: 92, status: "active",      lastSync: "1 hr ago",    createdAt: "2024-02-20" },
  { id: "PLZ004", name: "NH-58 Meerut Plaza",   route: "NH-58", location: "Meerut, UP",         operatorId: "",       operatorName: "Unassigned",   workerCount: 0,  activeDevices: 0, attendanceToday: 0,  attendancePct: 0,  status: "inactive",   lastSync: "Never",       createdAt: "2024-03-10" },
  { id: "PLZ005", name: "NH-24 Delhi Toll",     route: "NH-24", location: "Delhi",              operatorId: "OPR004", operatorName: "Shreya Singh", workerCount: 18, activeDevices: 1, attendanceToday: 15, attendancePct: 83, status: "maintenance", lastSync: "3 hrs ago",   createdAt: "2024-03-25" },
];

const SEED_OPERATORS: AdminOperator[] = [
  { id: "OPR001", userId: "OPR001", name: "Rajan Mehta",  mobile: "9811234567", email: "rajan@nhai.in",   plazaId: "PLZ001", plazaName: "NH-48 Gurugram Plaza", status: "active",    lastLogin: "Today, 08:15 AM", loginCount: 142, deviceCount: 1, createdAt: "2024-01-15" },
  { id: "OPR002", userId: "OPR002", name: "Kavita Joshi", mobile: "9822345678", email: "kavita@nhai.in",  plazaId: "PLZ002", plazaName: "NH-8 Manesar Plaza",   status: "active",    lastLogin: "Today, 09:02 AM", loginCount: 98,  deviceCount: 1, createdAt: "2024-02-01" },
  { id: "OPR003", userId: "OPR003", name: "Arun Patel",   mobile: "9833456789", email: "arun@nhai.in",    plazaId: "PLZ003", plazaName: "NH-44 Panipat Plaza",  status: "active",    lastLogin: "Today, 07:48 AM", loginCount: 87,  deviceCount: 1, createdAt: "2024-02-20" },
  { id: "OPR004", userId: "OPR004", name: "Shreya Singh", mobile: "9844567890", email: "shreya@nhai.in",  plazaId: "PLZ005", plazaName: "NH-24 Delhi Toll",     status: "suspended", lastLogin: "3 days ago",      loginCount: 54,  deviceCount: 1, createdAt: "2024-03-10" },
  { id: "OPR005", userId: "OPR005", name: "Vikram Rao",   mobile: "9855678901", email: "vikram@nhai.in",  plazaId: "",       plazaName: "Unassigned",           status: "pending",   lastLogin: "Never",           loginCount: 0,   deviceCount: 0, createdAt: "2024-05-15" },
];

async function ensureSeeded(): Promise<void> {
  const seeded = await AsyncStorage.getItem(SEEDED_KEY);
  if (seeded) return;
  await AsyncStorage.multiSet([
    [PLAZAS_KEY,    JSON.stringify(SEED_PLAZAS)],
    [OPERATORS_KEY, JSON.stringify(SEED_OPERATORS)],
    [SEEDED_KEY,    "1"],
  ]);
}

function nowDate(): string { return new Date().toISOString().split("T")[0]; }

/* ─── Toll Plaza CRUD ─── */

export async function getTollPlazas(): Promise<TollPlaza[]> {
  const apiData = await apiGet<any[]>("admin/plazas");
  if (apiData) {
    const plazas = apiData.map(normalisePlaza);
    await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(plazas));
    console.log(`[adminStore] getTollPlazas (API) → ${plazas.length}`);
    return plazas;
  }
  await ensureSeeded();
  const raw = await AsyncStorage.getItem(PLAZAS_KEY);
  const plazas: TollPlaza[] = raw ? JSON.parse(raw) : [];
  console.log(`[adminStore] getTollPlazas (cache) → ${plazas.length}`);
  return plazas;
}

export async function addTollPlaza(data: Pick<TollPlaza, "name" | "route" | "location">): Promise<TollPlaza> {
  const apiRow = await apiPost<any>("admin/plazas", { ...data, performedBy: "ADMIN" });
  if (apiRow) {
    const plaza = normalisePlaza(apiRow);
    const cached = await getTollPlazas();
    if (!cached.some((p) => p.id === plaza.id)) {
      await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify([...cached, plaza]));
    }
    return plaza;
  }
  const plazas = await getTollPlazas();
  const nums = plazas.map((x) => parseInt(x.id.replace("PLZ", ""), 10)).filter((n) => !isNaN(n));
  const nextId = `PLZ${String(nums.length > 0 ? Math.max(...nums) + 1 : 1).padStart(3, "0")}`;
  const plaza: TollPlaza = { id: nextId, name: data.name, route: data.route || "—", location: data.location || "—", operatorId: "", operatorName: "Unassigned", workerCount: 0, activeDevices: 0, attendanceToday: 0, attendancePct: 0, status: "inactive", lastSync: "Never", createdAt: nowDate() };
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify([...plazas, plaza]));
  return plaza;
}

export async function updateTollPlaza(id: string, changes: Partial<TollPlaza>): Promise<void> {
  await apiPut(`admin/plazas/${id}`, { ...changes, performedBy: "ADMIN" });
  const plazas = await getTollPlazas();
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(plazas.map((p) => (p.id === id ? { ...p, ...changes } : p))));
}

export async function deleteTollPlaza(id: string): Promise<void> {
  await apiDelete(`admin/plazas/${id}`);
  const plazas = await getTollPlazas();
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(plazas.filter((p) => p.id !== id)));
}

/* ─── Operator CRUD ─── */

export async function getOperators(): Promise<AdminOperator[]> {
  const apiData = await apiGet<any[]>("admin/operators");
  if (apiData) {
    const ops = apiData.map(normaliseOperator);
    await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(ops));
    console.log(`[adminStore] getOperators (API) → ${ops.length}`);
    return ops;
  }
  await ensureSeeded();
  const raw = await AsyncStorage.getItem(OPERATORS_KEY);
  const ops: AdminOperator[] = raw ? JSON.parse(raw) : [];
  console.log(`[adminStore] getOperators (cache) → ${ops.length}`);
  return ops;
}

export async function addOperator(data: Omit<AdminOperator, "id" | "createdAt" | "lastLogin" | "loginCount" | "deviceCount">): Promise<AdminOperator> {
  const apiRow = await apiPost<any>("admin/operators", { ...data, performedBy: "ADMIN" });
  if (apiRow) return normaliseOperator(apiRow);
  const ops = await getOperators();
  const op: AdminOperator = { id: data.userId, userId: data.userId.toUpperCase(), name: data.name, mobile: data.mobile, email: data.email, plazaId: data.plazaId, plazaName: data.plazaName, status: "pending", lastLogin: "Never", loginCount: 0, deviceCount: 0, createdAt: nowDate() };
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify([op, ...ops]));
  return op;
}

export async function updateOperator(id: string, changes: Partial<AdminOperator>): Promise<void> {
  await apiPut(`admin/operators/${id}`, { ...changes, performedBy: "ADMIN" });
  const ops = await getOperators();
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(ops.map((o) => (o.id === id ? { ...o, ...changes } : o))));
}

export async function deleteOperator(id: string): Promise<void> {
  const ops = await getOperators();
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(ops.filter((o) => o.id !== id)));
}

/* ─── Security Events ─── */

export async function getSecurityEvents(): Promise<SecurityEvent[]> {
  const apiData = await apiGet<any[]>("admin/security-events");
  if (apiData) {
    return apiData.map((e) => ({
      id:           String(e.id ?? ""),
      type:         (e.eventType as SecurityEvent["type"]) ?? "unauthorized_device",
      description:  e.description ?? "",
      deviceId:     e.deviceId ?? undefined,
      operatorId:   e.operatorId ?? undefined,
      operatorName: e.operatorName ?? undefined,
      severity:     (e.severity as SecurityEvent["severity"]) ?? "medium",
      timestamp:    e.createdAt ? new Date(e.createdAt).toLocaleString("en-IN") : "Unknown",
      resolved:     Boolean(e.resolved),
    }));
  }
  return [];
}

export async function resolveSecurityEvent(id: string): Promise<void> {
  await apiPut(`admin/security-events/${id}/resolve`, { performedBy: "ADMIN" });
}

/* ─── Audit Logs ─── */

export async function getAuditLogs(): Promise<AuditLog[]> {
  const apiData = await apiGet<any[]>("admin/audit-logs");
  if (apiData) {
    return apiData.map((l) => ({
      id:          String(l.id ?? ""),
      action:      l.action ?? "",
      performedBy: l.performedBy ?? "",
      targetType:  l.targetType ?? "",
      targetId:    l.targetId ?? "",
      details:     l.details ?? "",
      timestamp:   l.createdAt ? new Date(l.createdAt).toLocaleString("en-IN") : "Unknown",
    }));
  }
  return [];
}
