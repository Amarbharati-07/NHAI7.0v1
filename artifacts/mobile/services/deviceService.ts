import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

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

/* ─── Registered Device Store ─── */

export async function getRegisteredDevices(): Promise<RegisteredDevice[]> {
  const raw = await AsyncStorage.getItem(REG_DEVICES_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveRegisteredDevices(devices: RegisteredDevice[]): Promise<void> {
  await AsyncStorage.setItem(REG_DEVICES_KEY, JSON.stringify(devices));
}

export interface RegisterDeviceInput {
  deviceName: string;
  deviceModel: string;
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
  const raw = await AsyncStorage.getItem(ALLOCATIONS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveAllocations(allocations: OperatorAllocation[]): Promise<void> {
  await AsyncStorage.setItem(ALLOCATIONS_KEY, JSON.stringify(allocations));
}

export async function getOperatorAllocation(
  operatorId: string
): Promise<OperatorAllocation | null> {
  const allocations = await getAllocations();
  return allocations.find((a) => a.operatorId === operatorId && a.status === "active") ?? null;
}

export async function createAllocation(
  input: Omit<OperatorAllocation, "id">
): Promise<OperatorAllocation> {
  const [allocations, devices] = await Promise.all([getAllocations(), getRegisteredDevices()]);

  // Deactivate previous active allocation for this operator
  const deactivated = allocations.map((a) =>
    a.operatorId === input.operatorId && a.status === "active"
      ? { ...a, status: "replaced" as AllocStatus, replacedAt: new Date().toISOString() }
      : a
  );

  const newAlloc: OperatorAllocation = { ...input, id: `ALLOC${Date.now()}` };
  await saveAllocations([...deactivated, newAlloc]);

  // Update device: mark allocated + update assignment info + add history entry
  const historyEntry: AllocationHistoryEntry = {
    allocationId: newAlloc.id,
    operatorId:   input.operatorId,
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
            assignedOperatorId:   input.operatorId,
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

/* ─── Device Verification (by Device ID + Token) ─── */

export async function verifyDevice(operatorId: string): Promise<DeviceVerificationResult> {
  const allocation = await getOperatorAllocation(operatorId);

  if (!allocation) {
    return { authorized: false, plazaId: "", plazaName: "", deviceId: "", allocation: null, reason: "no_allocation" };
  }

  if (allocation.status === "blocked") {
    return {
      authorized: false,
      plazaId: allocation.plazaId, plazaName: allocation.plazaName,
      deviceId: allocation.deviceId, allocation, reason: "allocation_blocked",
    };
  }

  const currentToken = await getOrCreateDeviceToken();

  // Verify by both Device ID token — same physical device required
  if (currentToken !== allocation.deviceToken) {
    // Log unauthorized attempt
    return {
      authorized: false,
      plazaId: allocation.plazaId, plazaName: allocation.plazaName,
      deviceId: allocation.deviceId, allocation, reason: "device_mismatch",
    };
  }

  // Update last active time for the authorized device
  await updateDeviceActivity(allocation.deviceId, "active");

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
