import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { apiGetJson, apiPutJson, isApiConfigured } from "./apiConfig";

const DEVICE_TOKEN_KEY  = "@spectra_device_token";
const ALLOCATIONS_KEY   = "@spectra_allocations";
const REG_DEVICES_KEY   = "@spectra_registered_devices";

/* ─── Types ─── */

export type DevicePlatform = "android" | "ios" | "web";
export type DeviceStatus   = "available" | "allocated" | "blocked" | "inactive";
export type AllocStatus    = "active" | "blocked" | "replaced" | "inactive";

export interface AllocationHistoryEntry {
  allocationId: string;
  operatorId: string;
  operatorName: string;
  plazaId: string;
  plazaName: string;
  allocatedAt: string;
  allocatedBy: string;
  endedAt?: string;
  endReason?: string;
}

export interface RegisteredDevice {
  /* Core Identity */
  id: string;                  // Sequential: DEV001, DEV002, …
  deviceToken: string;         // SPT-{PLATFORM}-{UUID8} — unique per physical device
  appToken: string;            // APP-{UUID12} — app-layer secure token

  /* Hardware Info */
  deviceName: string;
  deviceModel: string;
  imeiNumber: string;          // 15-digit IMEI or "N/A" for web
  platform: DevicePlatform;
  osVersion: string;           // e.g. "Android 13", "iOS 17.2"

  /* Registration Metadata */
  registrationDate: string;    // YYYY-MM-DD
  registrationTime: string;    // HH:MM:SS
  registeredBy: string;        // Admin user ID

  /* Activity Tracking */
  lastActiveTime: string;      // ISO string or "Never"
  lastLoginTime: string;       // ISO string or "Never"

  /* Allocation */
  assignedOperatorId: string;
  assignedOperatorName: string;
  assignedPlazaId: string;
  assignedPlazaName: string;
  allocationHistory: AllocationHistoryEntry[];

  status: DeviceStatus;
}

export interface OperatorAllocation {
  id: string;
  operatorId: string;
  operatorName: string;
  plazaId: string;
  plazaName: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: DevicePlatform;
  deviceToken: string;          // Verified against physical device
  appToken: string;             // Secondary app-layer token
  status: AllocStatus;
  allocatedAt: string;
  allocatedBy: string;
  replacedAt?: string;
  blockReason?: string;
}

export type DeviceVerifyReason =
  | "authorized"
  | "no_allocation"
  | "device_mismatch"
  | "allocation_blocked";

export interface DeviceVerificationResult {
  authorized: boolean;
  plazaId: string;
  plazaName: string;
  deviceId: string;
  allocation: OperatorAllocation | null;
  reason: DeviceVerifyReason;
}

/* ─── Utilities ─── */

function uuid(): string {
  const hex = "0123456789ABCDEF";
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += hex[Math.floor(Math.random() * 16)];
    if (i === 7 || i === 11 || i === 15 || i === 19) s += "-";
  }
  return s;
}

function uuidSegment(len: number): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function nowDate(): string {
  return new Date().toISOString().split("T")[0];
}

function nowTime(): string {
  return new Date().toTimeString().split(" ")[0]; // HH:MM:SS
}

interface ServerDeviceRow {
  deviceId: string;
  deviceName?: string;
  deviceType?: DevicePlatform | string;
  deviceModel?: string;
  imei?: string;
  deviceToken?: string;
  operatorId?: string;
  operatorName?: string;
  plazaName?: string;
  status?: string;
  lastActive?: string;
  allocatedAt?: string;
}

/** Generate a sequential device ID (DEV001, DEV002, …) based on existing list */
function generateDeviceId(existing: RegisteredDevice[]): string {
  const nums = existing
    .map((d) => parseInt(d.id.replace("DEV", ""), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `DEV${String(next).padStart(3, "0")}`;
}

/** Generate a unique device token tied to platform */
export function generateDeviceToken(platform: DevicePlatform): string {
  return `SPT-${platform.toUpperCase()}-${uuidSegment(8)}`;
}

/** Generate a secure app-layer token */
export function generateAppToken(): string {
  return `APP-${uuidSegment(4)}-${uuidSegment(4)}-${uuidSegment(4)}`;
}

/* ─── Device token (persisted on current device) ─── */

export async function getOrCreateDeviceToken(): Promise<string> {
  let token = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    const platform = Platform.OS as DevicePlatform;
    token = generateDeviceToken(platform);
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

export function getDevicePlatform(): DevicePlatform {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

export function getDefaultOsVersion(platform: DevicePlatform): string {
  if (platform === "ios") return "iOS 17";
  if (platform === "android") return "Android 13";
  return "Web / Browser";
}

function mapServerDeviceStatus(status?: string): DeviceStatus {
  if (status === "blocked") return "blocked";
  if (status === "inactive") return "inactive";
  if (status === "allocated" || status === "active") return "allocated";
  return "available";
}

function mergeAllocationKey(
  allocation: Pick<OperatorAllocation, "deviceId" | "operatorId" | "plazaId" | "status">,
): string {
  return `${allocation.deviceId}|${allocation.operatorId}|${allocation.plazaId}|${allocation.status}`.toUpperCase();
}

function dedupeAllocations(allocations: OperatorAllocation[]): OperatorAllocation[] {
  const seenIds = new Set<string>();
  const seenBusinessKeys = new Set<string>();
  const deduped: OperatorAllocation[] = [];

  for (let index = allocations.length - 1; index >= 0; index -= 1) {
    const allocation = allocations[index];
    const allocationId = String(allocation.id ?? "").trim().toUpperCase();
    const businessKey = mergeAllocationKey(allocation);
    if (seenIds.has(allocationId) || seenBusinessKeys.has(businessKey)) continue;
    seenIds.add(allocationId);
    seenBusinessKeys.add(businessKey);
    deduped.push(allocation);
  }

  return deduped.reverse();
}

function dedupeDevices(devices: RegisteredDevice[]): RegisteredDevice[] {
  const seen = new Set<string>();
  const deduped: RegisteredDevice[] = [];

  for (let index = devices.length - 1; index >= 0; index -= 1) {
    const device = devices[index];
    if (seen.has(device.id)) continue;
    seen.add(device.id);
    deduped.push(device);
  }

  return deduped.reverse();
}

function pickNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function buildAllocationFromDevice(device: RegisteredDevice): OperatorAllocation | null {
  if (!device.assignedOperatorId) return null;
  return {
    id: `ALLOC-${device.id}`,
    operatorId: device.assignedOperatorId,
    operatorName: device.assignedOperatorName,
    plazaId: device.assignedPlazaId,
    plazaName: device.assignedPlazaName,
    deviceId: device.id,
    deviceName: device.deviceName,
    deviceModel: device.deviceModel,
    platform: device.platform,
    deviceToken: device.deviceToken,
    appToken: device.appToken,
    status: device.status === "blocked" ? "blocked" : "active",
    allocatedAt: device.registrationDate,
    allocatedBy: device.registeredBy,
  };
}

function normaliseServerDevice(
  row: ServerDeviceRow,
  local?: RegisteredDevice,
  localAllocation?: OperatorAllocation,
): RegisteredDevice {
  const platform = (row.deviceType as DevicePlatform) ?? local?.platform ?? "android";
  const resolvedDeviceToken = pickNonEmpty(row.deviceToken, local?.deviceToken, localAllocation?.deviceToken);
  return {
    id: row.deviceId,
    deviceToken: resolvedDeviceToken,
    appToken: local?.appToken ?? "",
    deviceName: row.deviceName ?? local?.deviceName ?? "Unknown Device",
    deviceModel: row.deviceModel ?? local?.deviceModel ?? "",
    imeiNumber: row.imei ?? local?.imeiNumber ?? "N/A",
    platform,
    osVersion: local?.osVersion ?? getDefaultOsVersion(platform),
    registrationDate: local?.registrationDate ?? row.allocatedAt ?? nowDate(),
    registrationTime: local?.registrationTime ?? nowTime(),
    registeredBy: local?.registeredBy ?? "ADMIN",
    lastActiveTime: row.lastActive ?? local?.lastActiveTime ?? "Never",
    lastLoginTime: local?.lastLoginTime ?? "Never",
    assignedOperatorId: row.operatorId ?? local?.assignedOperatorId ?? "",
    assignedOperatorName: row.operatorName ?? local?.assignedOperatorName ?? "Unassigned",
    assignedPlazaId: local?.assignedPlazaId ?? "",
    assignedPlazaName: row.plazaName ?? local?.assignedPlazaName ?? "Unassigned",
    allocationHistory: local?.allocationHistory ?? [],
    status: mapServerDeviceStatus(row.status ?? local?.status),
  };
}

let hydratePromise: Promise<{ devices: RegisteredDevice[]; allocations: OperatorAllocation[] }> | null = null;

async function hydrateDeviceStateFromApi(): Promise<{ devices: RegisteredDevice[]; allocations: OperatorAllocation[] }> {
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const [serverRows, localDevices, localAllocations] = await Promise.all([
      apiGetJson<ServerDeviceRow[]>("admin/devices"),
      getRegisteredDevicesLocal(),
      getAllocationsLocal(),
    ]);

    const localById = new Map(localDevices.map((d) => [d.id, d]));
    const localAllocByDeviceId = new Map(localAllocations.map((a) => [a.deviceId, a]));
    const localAllocByOperatorId = new Map(localAllocations.map((a) => [a.operatorId, a]));
    const serverDeviceMap = new Map<string, RegisteredDevice>();
    for (const row of serverRows) {
      const localDevice = localById.get(row.deviceId);
      const localAllocation =
        localAllocByDeviceId.get(row.deviceId) ??
        (row.operatorId ? localAllocByOperatorId.get(row.operatorId) : undefined);
      serverDeviceMap.set(row.deviceId, normaliseServerDevice(row, localDevice, localAllocation));
    }
    const serverDevices = dedupeDevices([...serverDeviceMap.values()]);
    const serverDeviceIds = new Set(serverDevices.map((d) => d.id));
    const localOnlyDevices = localDevices.filter((d) => !serverDeviceIds.has(d.id));
    const mergedDevices = dedupeDevices([...serverDevices, ...localOnlyDevices]);

    const serverAllocations = serverDevices
      .map(buildAllocationFromDevice)
      .filter((a): a is OperatorAllocation => Boolean(a));
    const serverAllocKeys = new Set(serverAllocations.map((a) => `${a.id}|${mergeAllocationKey(a)}`));
    const localOnlyAllocations = localAllocations.filter((a) => !serverAllocKeys.has(`${a.id}|${mergeAllocationKey(a)}`));
    const mergedAllocations = dedupeAllocations([...serverAllocations, ...localOnlyAllocations]);

    console.info("[deviceService] hydrate merged allocations", {
      serverAllocations: serverAllocations.length,
      localOnlyAllocations: localOnlyAllocations.length,
      mergedAllocations: mergedAllocations.length,
      allocationList: mergedAllocations.map((allocation) => ({
        id: allocation.id,
        deviceId: allocation.deviceId,
        operatorId: allocation.operatorId,
        plazaId: allocation.plazaId,
        status: allocation.status,
      })),
    });

    await Promise.all([
      saveRegisteredDevices(mergedDevices),
      saveAllocations(mergedAllocations),
    ]);

    return { devices: mergedDevices, allocations: mergedAllocations };
  })().finally(() => {
    hydratePromise = null;
  });

  return hydratePromise;
}

/* ─── Registered Device Store ─── */

export async function getRegisteredDevices(): Promise<RegisteredDevice[]> {
  if (isApiConfigured()) {
    try {
      return (await hydrateDeviceStateFromApi()).devices;
    } catch (err) {
      console.warn("[deviceService] getRegisteredDevices API hydrate failed:", err);
      return getRegisteredDevicesLocal();
    }
  }
  return getRegisteredDevicesLocal();
}

async function saveRegisteredDevices(devices: RegisteredDevice[]): Promise<void> {
  await AsyncStorage.setItem(REG_DEVICES_KEY, JSON.stringify(dedupeDevices(devices)));
}

async function getRegisteredDevicesLocal(): Promise<RegisteredDevice[]> {
  const raw = await AsyncStorage.getItem(REG_DEVICES_KEY);
  return raw ? dedupeDevices(JSON.parse(raw)) : [];
}

export interface RegisterDeviceInput {
  deviceName: string;
  deviceModel: string;
  imeiNumber: string;
  platform: DevicePlatform;
  osVersion: string;
  deviceToken: string;
  registeredBy: string;
  assignedPlazaId?: string;
  assignedPlazaName?: string;
}

export async function registerDevice(input: RegisterDeviceInput): Promise<RegisteredDevice> {
  const devices = await getRegisteredDevices();
  const newDevice: RegisteredDevice = {
    id:                   generateDeviceId(devices),
    deviceToken:          input.deviceToken,
    appToken:             generateAppToken(),
    deviceName:           input.deviceName,
    deviceModel:          input.deviceModel,
    imeiNumber:           input.imeiNumber || "N/A",
    platform:             input.platform,
    osVersion:            input.osVersion,
    registrationDate:     nowDate(),
    registrationTime:     nowTime(),
    registeredBy:         input.registeredBy,
    lastActiveTime:       "Never",
    lastLoginTime:        "Never",
    assignedOperatorId:   "",
    assignedOperatorName: "Unassigned",
    assignedPlazaId:      input.assignedPlazaId ?? "",
    assignedPlazaName:    input.assignedPlazaName ?? "Unassigned",
    allocationHistory:    [],
    status:               "available",
  };
  await saveRegisteredDevices([...devices, newDevice]);
  return newDevice;
}

export async function updateDeviceStatus(deviceId: string, status: DeviceStatus): Promise<void> {
  const devices = await getRegisteredDevices();
  await saveRegisteredDevices(devices.map((d) => d.id === deviceId ? { ...d, status } : d));
}

/** Permanently remove a device and its operator allocations from local storage. */
export async function deleteRegisteredDevice(deviceId: string): Promise<void> {
  const [devices, allocations] = await Promise.all([getRegisteredDevices(), getAllocations()]);
  await saveRegisteredDevices(devices.filter((d) => d.id !== deviceId));
  await saveAllocations(allocations.filter((a) => a.deviceId !== deviceId));
}

export async function updateDeviceActivity(deviceId: string, type: "active" | "login"): Promise<void> {
  const devices = await getRegisteredDevices();
  const now = new Date().toLocaleString("en-IN");
  await saveRegisteredDevices(
    devices.map((d) =>
      d.id === deviceId
        ? {
            ...d,
            lastActiveTime: now,
            lastLoginTime: type === "login" ? now : d.lastLoginTime,
          }
        : d
    )
  );
}

/* ─── Allocation Store ─── */

export async function getAllocations(): Promise<OperatorAllocation[]> {
  if (isApiConfigured()) {
    try {
      return (await hydrateDeviceStateFromApi()).allocations;
    } catch (err) {
      console.warn("[deviceService] getAllocations API hydrate failed:", err);
      return getAllocationsLocal();
    }
  }
  return getAllocationsLocal();
}

async function saveAllocations(allocations: OperatorAllocation[]): Promise<void> {
  await AsyncStorage.setItem(ALLOCATIONS_KEY, JSON.stringify(dedupeAllocations(allocations)));
}

async function getAllocationsLocal(): Promise<OperatorAllocation[]> {
  const raw = await AsyncStorage.getItem(ALLOCATIONS_KEY);
  return raw ? dedupeAllocations(JSON.parse(raw)) : [];
}

async function saveAllocationDeviceToken(
  operatorId: string,
  deviceId: string,
  deviceToken: string,
): Promise<void> {
  const allocations = await getAllocationsLocal();
  let changed = false;
  const next = allocations.map((alloc) => {
    if (alloc.operatorId !== operatorId || alloc.deviceId !== deviceId) return alloc;
    if (alloc.deviceToken === deviceToken) return alloc;
    changed = true;
    return { ...alloc, deviceToken };
  });
  if (changed) {
    await saveAllocations(next);
  }
}

function normalizeOperatorId(operatorId: string): string {
  return operatorId.trim().toUpperCase();
}

function resolveOperatorAllocation(
  allocations: OperatorAllocation[],
  operatorId: string,
  deviceToken?: string,
  deviceId?: string,
): OperatorAllocation | null {
  const normalizedOperatorId = normalizeOperatorId(operatorId);
  const active = allocations.filter(
    (allocation) =>
      normalizeOperatorId(allocation.operatorId) === normalizedOperatorId &&
      allocation.status === "active",
  );
  const normalizedToken = deviceToken?.trim();
  const normalizedDeviceId = deviceId?.trim().toUpperCase();

  if (normalizedToken) {
    const byToken = [...active].reverse().find((allocation) => allocation.deviceToken.trim() === normalizedToken);
    if (byToken) return byToken;
  }

  if (normalizedDeviceId) {
    const byDeviceId = [...active].reverse().find((allocation) => allocation.deviceId.trim().toUpperCase() === normalizedDeviceId);
    if (byDeviceId) return byDeviceId;
  }

  return active.length > 0 ? active[active.length - 1] : null;
}

export async function getOperatorAllocation(
  operatorId: string,
  options?: { deviceToken?: string; deviceId?: string },
): Promise<OperatorAllocation | null> {
  const allocations = await getAllocations();
  return resolveOperatorAllocation(allocations, operatorId, options?.deviceToken, options?.deviceId);
}

export async function createAllocation(
  input: Omit<OperatorAllocation, "id">
): Promise<OperatorAllocation> {
  const [allocations, devices] = await Promise.all([getAllocations(), getRegisteredDevices()]);

  // Deactivate previous active allocation for this operator
  const normalizedInputOperatorId = normalizeOperatorId(input.operatorId);
  const deactivated = allocations.map((a) =>
    normalizeOperatorId(a.operatorId) === normalizedInputOperatorId && a.status === "active"
      ? { ...a, status: "replaced" as AllocStatus, replacedAt: new Date().toISOString() }
      : a
  );

  const newAlloc: OperatorAllocation = {
    ...input,
    operatorId: normalizedInputOperatorId,
    id: `ALLOC${Date.now()}`,
  };
  await saveAllocations([...deactivated, newAlloc]);

  // Update device: mark allocated + update assignment info + add history entry
  const historyEntry: AllocationHistoryEntry = {
    allocationId: newAlloc.id,
    operatorId:   normalizedInputOperatorId,
    operatorName: input.operatorName,
    plazaId:      input.plazaId,
    plazaName:    input.plazaName,
    allocatedAt:  input.allocatedAt,
    allocatedBy:  input.allocatedBy,
  };
  await saveRegisteredDevices(
    devices.map((d) =>
      d.id === input.deviceId
        ? {
            ...d,
            status:               "allocated" as DeviceStatus,
            assignedOperatorId:   normalizedInputOperatorId,
            assignedOperatorName: input.operatorName,
            assignedPlazaId:      input.plazaId,
            assignedPlazaName:    input.plazaName,
            allocationHistory:    [...(d.allocationHistory ?? []), historyEntry],
          }
        : d
    )
  );

  return newAlloc;
}

export async function updateAllocationStatus(
  allocationId: string,
  status: AllocStatus,
  reason?: string
): Promise<void> {
  const [allocations, devices] = await Promise.all([getAllocations(), getRegisteredDevices()]);

  const alloc = allocations.find((a) => a.id === allocationId);
  const updated = allocations.map((a) =>
    a.id === allocationId
      ? { ...a, status, blockReason: reason, replacedAt: new Date().toISOString() }
      : a
  );
  await saveAllocations(updated);

  if (alloc && (status === "blocked" || status === "replaced" || status === "inactive")) {
    const newDevStatus: DeviceStatus = status === "blocked" ? "blocked" : "available";
    // Update history end reason
    await saveRegisteredDevices(
      devices.map((d) =>
        d.id === alloc.deviceId
          ? {
              ...d,
              status: newDevStatus,
              assignedOperatorId:   "",
              assignedOperatorName: "Unassigned",
              assignedPlazaId:      "",
              assignedPlazaName:    "Unassigned",
              allocationHistory: d.allocationHistory.map((h) =>
                h.allocationId === allocationId
                  ? { ...h, endedAt: new Date().toISOString(), endReason: reason ?? status }
                  : h
              ),
            }
          : d
      )
    );
  }
}

/* ─── Bootstrap: sync operator device allocation from API login ─── */

export type BootstrapServerDevice = {
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  deviceType: string;
  deviceToken?: string;
  plazaName: string;
  status?: string;
};

async function syncDeviceTokenToServer(
  deviceId: string,
  operator: { userId: string; name: string; plazaName: string },
  deviceToken: string,
  performedBy: string,
): Promise<void> {
  if (!isApiConfigured()) return;
  await apiPutJson(
    `admin/devices/${encodeURIComponent(deviceId)}`,
    {
      operatorId: normalizeOperatorId(operator.userId),
      operatorName: operator.name,
      plazaName: operator.plazaName,
      status: "active",
      deviceToken,
      performedBy,
    },
    15000,
  );
}

export async function ensureOperatorAllocationFromBootstrap(
  operator: { userId: string; name: string; plazaId: string; plazaName: string; loginCount?: number },
  serverDevice: BootstrapServerDevice | null,
  localDeviceToken: string,
): Promise<OperatorAllocation | null> {
  const operatorId = normalizeOperatorId(operator.userId);
  const plaza = {
    plazaId: operator.plazaId ?? "",
    plazaName: operator.plazaName ?? serverDevice?.plazaName ?? "Unassigned",
  };

  console.log("Logged Operator:", operatorId);
  console.log("Device Found:", serverDevice);
  console.log("Plaza:", plaza);

  if (!serverDevice?.deviceId) {
    console.log("Allocation:", null);
    return null;
  }

  const serverToken = serverDevice.deviceToken?.trim() ?? "";
  const loginCount = operator.loginCount ?? 0;
  const isFirstOperatorLogin = loginCount <= 1;

  let boundToken = localDeviceToken;
  if (serverToken && serverToken !== localDeviceToken) {
    if (isFirstOperatorLogin) {
      console.info("[deviceService] bootstrap binding device token on first operator login", {
        operatorId,
        deviceId: serverDevice.deviceId,
        previousToken: serverToken.slice(0, 12),
        boundToken: localDeviceToken.slice(0, 12),
      });
      boundToken = localDeviceToken;
      try {
        await syncDeviceTokenToServer(serverDevice.deviceId, operator, boundToken, "BOOTSTRAP_BIND");
      } catch (err) {
        console.warn("[deviceService] bootstrap token bind sync failed:", err);
      }
    } else {
      console.warn("[deviceService] bootstrap denied — token mismatch on non-first login", {
        operatorId,
        deviceId: serverDevice.deviceId,
        serverToken: serverToken.slice(0, 12),
        localToken: localDeviceToken.slice(0, 12),
        loginCount,
      });
      console.log("Allocation:", null);
      return null;
    }
  } else if (!serverToken) {
    boundToken = localDeviceToken;
    try {
      await syncDeviceTokenToServer(serverDevice.deviceId, operator, boundToken, "BOOTSTRAP_BIND");
    } catch (err) {
      console.warn("[deviceService] bootstrap empty-token bind failed:", err);
    }
  } else {
    boundToken = serverToken;
  }

  const platform = (serverDevice.deviceType as DevicePlatform) ?? "android";
  const devices = await getRegisteredDevicesLocal();
  const deviceIdx = devices.findIndex((d) => d.id === serverDevice.deviceId);
  const devicePatch: RegisteredDevice = {
    ...(deviceIdx >= 0 ? devices[deviceIdx] : {
      id: serverDevice.deviceId,
      appToken: generateAppToken(),
      imeiNumber: "N/A",
      registrationDate: nowDate(),
      registrationTime: nowTime(),
      registeredBy: "ADMIN",
      lastActiveTime: "Never",
      lastLoginTime: "Never",
      allocationHistory: [],
    }),
    deviceToken: boundToken,
    deviceName: serverDevice.deviceName,
    deviceModel: serverDevice.deviceModel,
    platform,
    osVersion: deviceIdx >= 0 ? devices[deviceIdx].osVersion : getDefaultOsVersion(platform),
    assignedOperatorId: operatorId,
    assignedOperatorName: operator.name,
    assignedPlazaId: plaza.plazaId,
    assignedPlazaName: plaza.plazaName,
    status: "allocated",
  };
  if (deviceIdx >= 0) {
    devices[deviceIdx] = { ...devices[deviceIdx], ...devicePatch };
  } else {
    devices.push(devicePatch as RegisteredDevice);
  }
  await saveRegisteredDevices(devices);

  const existing = await getOperatorAllocation(operatorId);
  let allocation: OperatorAllocation;

  if (
    existing &&
    existing.status === "active" &&
    existing.deviceId === serverDevice.deviceId
  ) {
    allocation = { ...existing, deviceToken: boundToken, plazaId: plaza.plazaId, plazaName: plaza.plazaName };
    await saveAllocationDeviceToken(operatorId, serverDevice.deviceId, boundToken);
  } else {
    allocation = await createAllocation({
      operatorId,
      operatorName: operator.name,
      plazaId: plaza.plazaId,
      plazaName: plaza.plazaName,
      deviceId: serverDevice.deviceId,
      deviceName: serverDevice.deviceName,
      deviceModel: serverDevice.deviceModel,
      platform,
      deviceToken: boundToken,
      appToken: devicePatch.appToken,
      status: "active",
      allocatedAt: nowDate(),
      allocatedBy: "BOOTSTRAP",
    });
  }

  console.log("Allocation:", allocation);
  return allocation;
}

/* ─── Device Verification (by Device ID + Token) ─── */

export async function verifyDevice(operatorId: string): Promise<DeviceVerificationResult> {
  const normalizedOperatorId = normalizeOperatorId(operatorId);
  const currentToken = await getOrCreateDeviceToken();
  let allocation = await getOperatorAllocation(normalizedOperatorId, {
    deviceToken: currentToken,
  });

  if (!allocation && isApiConfigured()) {
    try {
      await hydrateDeviceStateFromApi();
      allocation = await getOperatorAllocation(normalizedOperatorId, {
        deviceToken: currentToken,
      });
    } catch (err) {
      console.warn("[deviceService] verifyDevice hydrate failed:", err);
    }
  }

  const devices = await getRegisteredDevices();
  const currentDevice = devices.find((device) => device.deviceToken === currentToken);
  if (!allocation) {
    allocation = await getOperatorAllocation(normalizedOperatorId, {
      deviceToken: currentToken,
      deviceId: currentDevice?.id,
    });
  }

  console.log("Logged Operator:", normalizedOperatorId);
  console.log("Device Found:", currentDevice ?? null);
  console.log("Allocation:", allocation);
  console.log("Plaza:", {
    plazaId: allocation?.plazaId ?? "",
    plazaName: allocation?.plazaName ?? "",
  });
  console.info("DEVICE_VERIFICATION", {
    operatorId: normalizedOperatorId,
    hasAllocation: Boolean(allocation),
    allocationId: allocation?.id ?? "",
    allocatedDeviceId: allocation?.deviceId ?? "",
    allocatedDeviceToken: allocation?.deviceToken ? allocation.deviceToken.slice(0, 12) : "",
    currentDeviceId: currentDevice?.id ?? "",
    currentDeviceToken: currentToken.slice(0, 12),
    plazaId: allocation?.plazaId ?? "",
  });

  if (!allocation) {
    console.info("[deviceService] verifyDevice", { operatorId: normalizedOperatorId, authorized: false, reason: "no_allocation" });
    return { authorized: false, plazaId: "", plazaName: "", deviceId: "", allocation: null, reason: "no_allocation" };
  }

  if (allocation.status === "blocked") {
    console.info("[deviceService] verifyDevice", {
      operatorId,
      authorized: false,
      reason: "allocation_blocked",
      deviceId: allocation.deviceId,
      plazaId: allocation.plazaId,
    });
    return {
      authorized: false,
      plazaId: allocation.plazaId, plazaName: allocation.plazaName,
      deviceId: allocation.deviceId, allocation, reason: "allocation_blocked",
    };
  }

  // Verify by both Device ID token — same physical device required
  if (currentToken !== allocation.deviceToken) {
    if (!allocation.deviceToken || allocation.deviceToken.trim() === "") {
      const matchingDevice = (await getRegisteredDevices()).find((device) => device.deviceToken === currentToken);
      if (!matchingDevice || matchingDevice.id !== allocation.deviceId) {
        console.info("DEVICE_VERIFICATION", {
          operatorId,
          authorized: false,
          reason: "device_mismatch",
          deviceId: allocation.deviceId,
          plazaId: allocation.plazaId,
          currentToken: currentToken.slice(0, 10),
        });
        return {
          authorized: false,
          plazaId: allocation.plazaId, plazaName: allocation.plazaName,
          deviceId: allocation.deviceId, allocation, reason: "device_mismatch",
        };
      }
      console.info("[deviceService] verifyDevice repairing missing allocation token", {
        operatorId,
        deviceId: allocation.deviceId,
        plazaId: allocation.plazaId,
      });
      await saveAllocationDeviceToken(operatorId, allocation.deviceId, currentToken);
      if (isApiConfigured()) {
        try {
          await apiPutJson(`admin/devices/${encodeURIComponent(allocation.deviceId)}`, {
            operatorId,
            operatorName: allocation.operatorName,
            plazaName: allocation.plazaName,
            status: "active",
            deviceToken: currentToken,
            performedBy: "VERIFY",
          }, 15000);
        } catch (err) {
          console.warn("[deviceService] verifyDevice token repair sync failed:", err);
        }
      }
    } else {
      console.info("DEVICE_VERIFICATION", {
        operatorId,
        authorized: false,
        reason: "device_mismatch",
        deviceId: allocation.deviceId,
        plazaId: allocation.plazaId,
        currentToken: currentToken.slice(0, 10),
        allocationToken: allocation.deviceToken.slice(0, 10),
      });
      // Log unauthorized attempt
      return {
        authorized: false,
        plazaId: allocation.plazaId, plazaName: allocation.plazaName,
        deviceId: allocation.deviceId, allocation, reason: "device_mismatch",
      };
    }
  }

  // Update last active time for the authorized device
  await updateDeviceActivity(allocation.deviceId, "active");
  console.info("DEVICE_VERIFICATION", {
    operatorId,
    authorized: true,
    reason: "authorized",
    deviceId: allocation.deviceId,
    plazaId: allocation.plazaId,
    token: currentToken.slice(0, 10),
  });

  return {
    authorized: true,
    plazaId: allocation.plazaId, plazaName: allocation.plazaName,
    deviceId: allocation.deviceId, allocation, reason: "authorized",
  };
}

/* ─── Demo Data Initialiser ─── */

export async function initDemoData(): Promise<void> {
  const existingAlloc = await AsyncStorage.getItem(ALLOCATIONS_KEY);
  if (existingAlloc) return;

  const deviceToken = await getOrCreateDeviceToken();
  const platform    = getDevicePlatform();
  const osVersion   = getDefaultOsVersion(platform);

  const registeredDevices: RegisteredDevice[] = [
    {
      id: "DEV001",
      deviceToken,
      appToken: "APP-PRIM-DEMO-0001",
      deviceName: "Primary Field Device",
      deviceModel: platform === "ios" ? "iPhone 14" : platform === "android" ? "Android Phone" : "Web Browser",
      imeiNumber: platform === "web" ? "N/A" : "356938035643809",
      platform,
      osVersion,
      registrationDate: "2024-01-15",
      registrationTime: "09:30:00",
      registeredBy: "ADMIN001",
      lastActiveTime: "Today, 09:15 AM",
      lastLoginTime: "Today, 08:55 AM",
      assignedOperatorId: "OPR001",
      assignedOperatorName: "John Operator",
      assignedPlazaId: "PLZ001",
      assignedPlazaName: "NH-48 Gurugram Plaza",
      allocationHistory: [
        {
          allocationId: "ALLOC001",
          operatorId: "OPR001",
          operatorName: "John Operator",
          plazaId: "PLZ001",
          plazaName: "NH-48 Gurugram Plaza",
          allocatedAt: "2024-01-15",
          allocatedBy: "ADMIN001",
        },
      ],
      status: "allocated",
    },
    {
      id: "DEV002",
      deviceToken: "SPT-ANDROID-SPARE001",
      appToken: "APP-SPAR-DEMO-0002",
      deviceName: "Spare Device Alpha",
      deviceModel: "Samsung Galaxy A54",
      imeiNumber: "490154203237518",
      platform: "android",
      osVersion: "Android 13",
      registrationDate: "2024-03-01",
      registrationTime: "11:00:00",
      registeredBy: "ADMIN001",
      lastActiveTime: "2024-06-10, 02:30 PM",
      lastLoginTime: "2024-06-10, 02:28 PM",
      assignedOperatorId: "",
      assignedOperatorName: "Unassigned",
      assignedPlazaId: "",
      assignedPlazaName: "Unassigned",
      allocationHistory: [],
      status: "available",
    },
    {
      id: "DEV003",
      deviceToken: "SPT-ANDROID-SPARE002",
      appToken: "APP-SPAR-DEMO-0003",
      deviceName: "Spare Device Beta",
      deviceModel: "Realme GT Neo 5",
      imeiNumber: "013012004678903",
      platform: "android",
      osVersion: "Android 14",
      registrationDate: "2024-04-10",
      registrationTime: "14:20:00",
      registeredBy: "ADMIN001",
      lastActiveTime: "Never",
      lastLoginTime: "Never",
      assignedOperatorId: "",
      assignedOperatorName: "Unassigned",
      assignedPlazaId: "",
      assignedPlazaName: "Unassigned",
      allocationHistory: [],
      status: "available",
    },
    {
      id: "DEV004",
      deviceToken: "SPT-ANDROID-BLKD001",
      appToken: "APP-BLKD-DEMO-0004",
      deviceName: "Blocked Device",
      deviceModel: "OnePlus 11",
      imeiNumber: "352099001761481",
      platform: "android",
      osVersion: "Android 13",
      registrationDate: "2024-02-15",
      registrationTime: "10:45:00",
      registeredBy: "ADMIN001",
      lastActiveTime: "3 days ago",
      lastLoginTime: "3 days ago",
      assignedOperatorId: "",
      assignedOperatorName: "Unassigned",
      assignedPlazaId: "",
      assignedPlazaName: "Unassigned",
      allocationHistory: [
        {
          allocationId: "ALLOC-OLD-001",
          operatorId: "OPR004",
          operatorName: "Shreya Singh",
          plazaId: "PLZ005",
          plazaName: "NH-24 Delhi Toll",
          allocatedAt: "2024-02-15",
          allocatedBy: "ADMIN001",
          endedAt: "2024-05-01T00:00:00.000Z",
          endReason: "blocked — unauthorized access attempts",
        },
      ],
      status: "blocked",
    },
  ];

  const allocations: OperatorAllocation[] = [
    {
      id: "ALLOC001",
      operatorId: "OPR001",
      operatorName: "John Operator",
      plazaId: "PLZ001",
      plazaName: "NH-48 Gurugram Plaza",
      deviceId: "DEV001",
      deviceName: "Primary Field Device",
      deviceModel: registeredDevices[0].deviceModel,
      platform,
      deviceToken,
      appToken: registeredDevices[0].appToken,
      status: "active",
      allocatedAt: "2024-01-15",
      allocatedBy: "ADMIN001",
    },
  ];

  await saveRegisteredDevices(registeredDevices);
  await saveAllocations(allocations);
}
