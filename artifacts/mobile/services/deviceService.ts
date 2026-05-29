import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const DEVICE_TOKEN_KEY = "@spectra_device_token";
const ALLOCATIONS_KEY  = "@spectra_allocations";
const REG_DEVICES_KEY  = "@spectra_registered_devices";

/* ─── Types ─── */

export type DevicePlatform = "android" | "ios" | "web";
export type DeviceStatus   = "available" | "allocated" | "blocked" | "inactive";
export type AllocStatus    = "active" | "blocked" | "replaced" | "inactive";

export interface RegisteredDevice {
  id: string;
  deviceName: string;
  deviceModel: string;
  platform: DevicePlatform;
  deviceToken: string;
  appToken: string;
  registrationDate: string;
  registeredBy: string;
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
  deviceToken: string;
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

/* ─── Simple UUID generator (no external dep) ─── */
function uuid(): string {
  const hex = "0123456789ABCDEF";
  let s = "";
  for (let i = 0; i < 32; i++) {
    s += hex[Math.floor(Math.random() * 16)];
    if (i === 7 || i === 11 || i === 15 || i === 19) s += "-";
  }
  return s;
}

/* ─── Device token ─── */

export async function getOrCreateDeviceToken(): Promise<string> {
  let token = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    const platform = Platform.OS;
    const random   = uuid().slice(0, 8);
    token = `SPT-${platform.toUpperCase()}-${random}`;
    await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

export function getDevicePlatform(): DevicePlatform {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

/* ─── Registered Device Store ─── */

export async function getRegisteredDevices(): Promise<RegisteredDevice[]> {
  const raw = await AsyncStorage.getItem(REG_DEVICES_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveRegisteredDevices(devices: RegisteredDevice[]): Promise<void> {
  await AsyncStorage.setItem(REG_DEVICES_KEY, JSON.stringify(devices));
}

export async function registerDevice(
  input: Omit<RegisteredDevice, "id" | "appToken" | "registrationDate">
): Promise<RegisteredDevice> {
  const devices = await getRegisteredDevices();
  const appToken = `APP-${uuid().slice(0, 12).toUpperCase()}`;
  const newDevice: RegisteredDevice = {
    ...input,
    id: `DEV${Date.now()}`,
    appToken,
    registrationDate: new Date().toISOString().split("T")[0],
  };
  await saveRegisteredDevices([...devices, newDevice]);
  return newDevice;
}

export async function updateDeviceStatus(deviceId: string, status: DeviceStatus): Promise<void> {
  const devices = await getRegisteredDevices();
  await saveRegisteredDevices(devices.map((d) => (d.id === deviceId ? { ...d, status } : d)));
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
  return (
    allocations.find((a) => a.operatorId === operatorId && a.status === "active") ?? null
  );
}

export async function createAllocation(
  input: Omit<OperatorAllocation, "id">
): Promise<OperatorAllocation> {
  const allocations = await getAllocations();
  const deactivated = allocations.map((a) =>
    a.operatorId === input.operatorId && a.status === "active"
      ? { ...a, status: "replaced" as AllocStatus, replacedAt: new Date().toISOString() }
      : a
  );
  const newAlloc: OperatorAllocation = { ...input, id: `ALLOC${Date.now()}` };
  await saveAllocations([...deactivated, newAlloc]);
  // Mark device as allocated
  await updateDeviceStatus(input.deviceId, "allocated");
  return newAlloc;
}

export async function updateAllocationStatus(
  allocationId: string,
  status: AllocStatus,
  reason?: string
): Promise<void> {
  const allocations = await getAllocations();
  const updated = allocations.map((a) =>
    a.id === allocationId ? { ...a, status, blockReason: reason } : a
  );
  await saveAllocations(updated);
  // If blocking/replacing, free up the device
  const alloc = allocations.find((a) => a.id === allocationId);
  if (alloc && (status === "blocked" || status === "replaced" || status === "inactive")) {
    await updateDeviceStatus(alloc.deviceId, status === "blocked" ? "blocked" : "available");
  }
}

/* ─── Device Verification ─── */

export async function verifyDevice(operatorId: string): Promise<DeviceVerificationResult> {
  const allocation = await getOperatorAllocation(operatorId);

  if (!allocation) {
    return {
      authorized: false, plazaId: "", plazaName: "", deviceId: "",
      allocation: null, reason: "no_allocation",
    };
  }

  if (allocation.status === "blocked") {
    return {
      authorized: false,
      plazaId: allocation.plazaId, plazaName: allocation.plazaName, deviceId: allocation.deviceId,
      allocation, reason: "allocation_blocked",
    };
  }

  const currentToken = await getOrCreateDeviceToken();
  if (currentToken !== allocation.deviceToken) {
    return {
      authorized: false,
      plazaId: allocation.plazaId, plazaName: allocation.plazaName, deviceId: allocation.deviceId,
      allocation, reason: "device_mismatch",
    };
  }

  return {
    authorized: true,
    plazaId: allocation.plazaId, plazaName: allocation.plazaName, deviceId: allocation.deviceId,
    allocation, reason: "authorized",
  };
}

/* ─── Demo Data Initialiser (runs once on first launch) ─── */

export async function initDemoData(): Promise<void> {
  const existingAlloc = await AsyncStorage.getItem(ALLOCATIONS_KEY);
  if (existingAlloc) return; // Already seeded

  const deviceToken = await getOrCreateDeviceToken();
  const platform    = getDevicePlatform();

  // Registered Devices
  const registeredDevices: RegisteredDevice[] = [
    {
      id: "DEV001",
      deviceName: "Primary Field Device",
      deviceModel: platform === "ios" ? "iPhone" : platform === "android" ? "Android Phone" : "Web Browser",
      platform,
      deviceToken,
      appToken: "APP-DEMO0001-PRIM",
      registrationDate: "2024-01-15",
      registeredBy: "ADMIN001",
      status: "allocated",
    },
    {
      id: "DEV002",
      deviceName: "Spare Device Alpha",
      deviceModel: "Samsung Galaxy A54",
      platform: "android",
      deviceToken: "SPT-ANDROID-SPARE001",
      appToken: "APP-DEMO0002-SPAR",
      registrationDate: "2024-03-01",
      registeredBy: "ADMIN001",
      status: "available",
    },
    {
      id: "DEV003",
      deviceName: "Spare Device Beta",
      deviceModel: "Realme GT Neo 5",
      platform: "android",
      deviceToken: "SPT-ANDROID-SPARE002",
      appToken: "APP-DEMO0003-SPAR",
      registrationDate: "2024-04-10",
      registeredBy: "ADMIN001",
      status: "available",
    },
    {
      id: "DEV004",
      deviceName: "Blocked Device",
      deviceModel: "OnePlus 11",
      platform: "android",
      deviceToken: "SPT-ANDROID-BLKD001",
      appToken: "APP-DEMO0004-BLKD",
      registrationDate: "2024-02-15",
      registeredBy: "ADMIN001",
      status: "blocked",
    },
  ];

  // Allocations — OPR001 gets the current device
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
      status: "active",
      allocatedAt: "2024-01-15",
      allocatedBy: "ADMIN001",
    },
  ];

  await saveRegisteredDevices(registeredDevices);
  await saveAllocations(allocations);
}
