import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TollPlaza, AdminOperator } from "./adminData";

const PLAZAS_KEY    = "@spectra_plazas_v3";
const OPERATORS_KEY = "@spectra_operators_v3";
const SEEDED_KEY    = "@spectra_admin_seeded_v3";

/* ─── Seed Data (applied once on first run) ─── */

const SEED_PLAZAS: TollPlaza[] = [
  { id: "PLZ001", name: "NH-48 Gurugram Plaza", route: "NH-48", location: "Gurugram, Haryana",  operatorId: "OPR001", operatorName: "Rajan Mehta",   workerCount: 32, activeDevices: 2, attendanceToday: 30, attendancePct: 94, status: "active",      lastSync: "10 mins ago", createdAt: "2024-01-15" },
  { id: "PLZ002", name: "NH-8 Manesar Plaza",   route: "NH-8",  location: "Manesar, Haryana",   operatorId: "OPR002", operatorName: "Kavita Joshi",   workerCount: 28, activeDevices: 2, attendanceToday: 24, attendancePct: 86, status: "active",      lastSync: "25 mins ago", createdAt: "2024-02-01" },
  { id: "PLZ003", name: "NH-44 Panipat Plaza",  route: "NH-44", location: "Panipat, Haryana",   operatorId: "OPR003", operatorName: "Arun Patel",     workerCount: 25, activeDevices: 1, attendanceToday: 23, attendancePct: 92, status: "active",      lastSync: "1 hr ago",    createdAt: "2024-02-20" },
  { id: "PLZ004", name: "NH-58 Meerut Plaza",   route: "NH-58", location: "Meerut, UP",         operatorId: "",       operatorName: "Unassigned",     workerCount: 0,  activeDevices: 0, attendanceToday: 0,  attendancePct: 0,  status: "inactive",   lastSync: "Never",       createdAt: "2024-03-10" },
  { id: "PLZ005", name: "NH-24 Delhi Toll",     route: "NH-24", location: "Delhi",              operatorId: "OPR004", operatorName: "Shreya Singh",   workerCount: 18, activeDevices: 1, attendanceToday: 15, attendancePct: 83, status: "maintenance", lastSync: "3 hrs ago",   createdAt: "2024-03-25" },
];

const SEED_OPERATORS: AdminOperator[] = [
  { id: "OPR001", userId: "OPR001", name: "Rajan Mehta",   mobile: "9811234567", email: "rajan@spectra.in",   plazaId: "PLZ001", plazaName: "NH-48 Gurugram Plaza", status: "active",    lastLogin: "Today, 08:15 AM", loginCount: 142, deviceCount: 1, createdAt: "2024-01-15" },
  { id: "OPR002", userId: "OPR002", name: "Kavita Joshi",  mobile: "9822345678", email: "kavita@spectra.in",  plazaId: "PLZ002", plazaName: "NH-8 Manesar Plaza",   status: "active",    lastLogin: "Today, 09:02 AM", loginCount: 98,  deviceCount: 1, createdAt: "2024-02-01" },
  { id: "OPR003", userId: "OPR003", name: "Arun Patel",    mobile: "9833456789", email: "arun@spectra.in",    plazaId: "PLZ003", plazaName: "NH-44 Panipat Plaza",  status: "active",    lastLogin: "Today, 07:48 AM", loginCount: 87,  deviceCount: 1, createdAt: "2024-02-20" },
  { id: "OPR004", userId: "OPR004", name: "Shreya Singh",  mobile: "9844567890", email: "shreya@spectra.in",  plazaId: "PLZ005", plazaName: "NH-24 Delhi Toll",     status: "suspended", lastLogin: "3 days ago",      loginCount: 54,  deviceCount: 1, createdAt: "2024-03-10" },
  { id: "OPR005", userId: "OPR005", name: "Vikram Rao",    mobile: "9855678901", email: "vikram@spectra.in",  plazaId: "",       plazaName: "Unassigned",           status: "pending",   lastLogin: "Never",           loginCount: 0,   deviceCount: 0, createdAt: "2024-05-15" },
];

/* ─── Internals ─── */

async function ensureSeeded(): Promise<void> {
  const seeded = await AsyncStorage.getItem(SEEDED_KEY);
  if (seeded) return;
  console.log("[adminStore] First run — seeding demo data");
  await AsyncStorage.multiSet([
    [PLAZAS_KEY,    JSON.stringify(SEED_PLAZAS)],
    [OPERATORS_KEY, JSON.stringify(SEED_OPERATORS)],
    [SEEDED_KEY,    "1"],
  ]);
}

function nowDate(): string { return new Date().toISOString().split("T")[0]; }

function nextId(prefix: string, existing: { id: string }[]): string {
  const nums = existing
    .map((x) => parseInt(x.id.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

/* ─── Toll Plaza CRUD ─── */

export async function getTollPlazas(): Promise<TollPlaza[]> {
  await ensureSeeded();
  const raw = await AsyncStorage.getItem(PLAZAS_KEY);
  const plazas: TollPlaza[] = raw ? JSON.parse(raw) : [];
  console.log(`[adminStore] getTollPlazas → ${plazas.length} records`);
  return plazas;
}

export async function addTollPlaza(
  data: Pick<TollPlaza, "name" | "route" | "location">
): Promise<TollPlaza> {
  const plazas = await getTollPlazas();
  const plaza: TollPlaza = {
    id:              nextId("PLZ", plazas),
    name:            data.name,
    route:           data.route || "—",
    location:        data.location || "—",
    operatorId:      "",
    operatorName:    "Unassigned",
    workerCount:     0,
    activeDevices:   0,
    attendanceToday: 0,
    attendancePct:   0,
    status:          "inactive",
    lastSync:        "Never",
    createdAt:       nowDate(),
  };
  const updated = [...plazas, plaza];
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(updated));
  console.log(`[adminStore] addTollPlaza → saved ${plaza.id} (${plaza.name}), total: ${updated.length}`);
  return plaza;
}

export async function updateTollPlaza(id: string, changes: Partial<TollPlaza>): Promise<void> {
  const plazas = await getTollPlazas();
  const updated = plazas.map((p) => (p.id === id ? { ...p, ...changes } : p));
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(updated));
  console.log(`[adminStore] updateTollPlaza → ${id}`, changes);
}

export async function deleteTollPlaza(id: string): Promise<void> {
  const plazas = await getTollPlazas();
  await AsyncStorage.setItem(PLAZAS_KEY, JSON.stringify(plazas.filter((p) => p.id !== id)));
  console.log(`[adminStore] deleteTollPlaza → ${id}`);
}

/* ─── Operator CRUD ─── */

export async function getOperators(): Promise<AdminOperator[]> {
  await ensureSeeded();
  const raw = await AsyncStorage.getItem(OPERATORS_KEY);
  const ops: AdminOperator[] = raw ? JSON.parse(raw) : [];
  console.log(`[adminStore] getOperators → ${ops.length} records`);
  return ops;
}

export async function addOperator(
  data: Omit<AdminOperator, "id" | "createdAt" | "lastLogin" | "loginCount" | "deviceCount">
): Promise<AdminOperator> {
  const ops = await getOperators();
  const op: AdminOperator = {
    id:          data.userId,
    userId:      data.userId.toUpperCase(),
    name:        data.name,
    mobile:      data.mobile,
    email:       data.email,
    plazaId:     data.plazaId,
    plazaName:   data.plazaName,
    status:      "pending",
    lastLogin:   "Never",
    loginCount:  0,
    deviceCount: 0,
    createdAt:   nowDate(),
  };
  const updated = [op, ...ops];
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(updated));
  console.log(`[adminStore] addOperator → saved ${op.id} (${op.name}), total: ${updated.length}`);
  return op;
}

export async function updateOperator(id: string, changes: Partial<AdminOperator>): Promise<void> {
  const ops = await getOperators();
  const updated = ops.map((o) => (o.id === id ? { ...o, ...changes } : o));
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(updated));
  console.log(`[adminStore] updateOperator → ${id}`, changes);
}

export async function deleteOperator(id: string): Promise<void> {
  const ops = await getOperators();
  await AsyncStorage.setItem(OPERATORS_KEY, JSON.stringify(ops.filter((o) => o.id !== id)));
  console.log(`[adminStore] deleteOperator → ${id}`);
}
