export interface TollPlaza {
  id: string;
  name: string;
  route: string;
  location: string;
  operatorId: string;
  operatorName: string;
  workerCount: number;
  activeDevices: number;
  attendanceToday: number;
  attendancePct: number;
  status: "active" | "inactive" | "maintenance";
  lastSync: string;
  createdAt: string;
}

export interface DeviceAllocation {
  id: string;
  deviceName: string;
  deviceType: "android" | "ios";
  deviceModel: string;
  imei: string;
  operatorId: string;
  operatorName: string;
  plazaName: string;
  status: "active" | "blocked" | "pending" | "replaced";
  lastActive: string;
  unauthorizedAttempts: number;
  allocatedAt: string;
}

export interface AdminOperator {
  id: string;
  userId: string;
  name: string;
  mobile: string;
  email: string;
  plazaId: string;
  plazaName: string;
  status: "active" | "suspended" | "pending";
  lastLogin: string;
  loginCount: number;
  deviceCount: number;
  createdAt: string;
}

export interface SecurityEvent {
  id: string;
  type: "unauthorized_device" | "failed_login" | "blocked_access" | "password_reset" | "device_blocked" | "suspicious_activity";
  description: string;
  deviceId?: string;
  operatorId?: string;
  operatorName?: string;
  severity: "high" | "medium" | "low";
  timestamp: string;
  resolved: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  performedBy: string;
  targetType: string;
  targetId: string;
  details: string;
  timestamp: string;
}

export interface PlazaAttendanceSummary {
  plazaId: string;
  plazaName: string;
  route: string;
  totalWorkers: number;
  present: number;
  absent: number;
  late: number;
  attendancePct: number;
  lastUpdate: string;
}

export const MOCK_TOLL_PLAZAS: TollPlaza[] = [
  {
    id: "PLZ001", name: "NH-48 Gurugram Plaza", route: "NH-48", location: "Gurugram, Haryana",
    operatorId: "OPR001", operatorName: "Rajan Mehta", workerCount: 32, activeDevices: 2,
    attendanceToday: 30, attendancePct: 94, status: "active", lastSync: "10 mins ago", createdAt: "2024-01-15",
  },
  {
    id: "PLZ002", name: "NH-8 Manesar Plaza", route: "NH-8", location: "Manesar, Haryana",
    operatorId: "OPR002", operatorName: "Kavita Joshi", workerCount: 28, activeDevices: 2,
    attendanceToday: 24, attendancePct: 86, status: "active", lastSync: "25 mins ago", createdAt: "2024-02-01",
  },
  {
    id: "PLZ003", name: "NH-44 Panipat Plaza", route: "NH-44", location: "Panipat, Haryana",
    operatorId: "OPR003", operatorName: "Arun Patel", workerCount: 25, activeDevices: 1,
    attendanceToday: 23, attendancePct: 92, status: "active", lastSync: "1 hr ago", createdAt: "2024-02-20",
  },
  {
    id: "PLZ004", name: "NH-58 Meerut Plaza", route: "NH-58", location: "Meerut, UP",
    operatorId: "", operatorName: "Unassigned", workerCount: 0, activeDevices: 0,
    attendanceToday: 0, attendancePct: 0, status: "inactive", lastSync: "Never", createdAt: "2024-03-10",
  },
  {
    id: "PLZ005", name: "NH-24 Delhi Toll", route: "NH-24", location: "Delhi",
    operatorId: "OPR004", operatorName: "Shreya Singh", workerCount: 18, activeDevices: 1,
    attendanceToday: 15, attendancePct: 83, status: "maintenance", lastSync: "3 hrs ago", createdAt: "2024-03-25",
  },
];

export const MOCK_DEVICES: DeviceAllocation[] = [
  {
    id: "DEV001", deviceName: "Plaza Device 1", deviceType: "android", deviceModel: "Samsung Galaxy A54",
    imei: "357891234567890", operatorId: "OPR001", operatorName: "Rajan Mehta", plazaName: "NH-48 Gurugram",
    status: "active", lastActive: "2 mins ago", unauthorizedAttempts: 0, allocatedAt: "2024-01-15",
  },
  {
    id: "DEV002", deviceName: "Plaza Device 2", deviceType: "android", deviceModel: "Realme GT Neo 5",
    imei: "358012345678901", operatorId: "OPR002", operatorName: "Kavita Joshi", plazaName: "NH-8 Manesar",
    status: "active", lastActive: "18 mins ago", unauthorizedAttempts: 0, allocatedAt: "2024-02-01",
  },
  {
    id: "DEV003", deviceName: "Plaza Device 3", deviceType: "ios", deviceModel: "iPhone 14",
    imei: "359123456789012", operatorId: "OPR003", operatorName: "Arun Patel", plazaName: "NH-44 Panipat",
    status: "active", lastActive: "55 mins ago", unauthorizedAttempts: 1, allocatedAt: "2024-02-20",
  },
  {
    id: "DEV004", deviceName: "Unallocated Device", deviceType: "android", deviceModel: "OnePlus 11",
    imei: "360234567890123", operatorId: "", operatorName: "Unassigned", plazaName: "—",
    status: "blocked", lastActive: "3 days ago", unauthorizedAttempts: 4, allocatedAt: "2024-03-01",
  },
  {
    id: "DEV005", deviceName: "New Device", deviceType: "ios", deviceModel: "iPhone 15",
    imei: "361345678901234", operatorId: "", operatorName: "Unassigned", plazaName: "—",
    status: "pending", lastActive: "Never", unauthorizedAttempts: 0, allocatedAt: "2024-05-20",
  },
  {
    id: "DEV006", deviceName: "Backup Device", deviceType: "android", deviceModel: "Xiaomi Redmi Note 12",
    imei: "362456789012345", operatorId: "OPR004", operatorName: "Shreya Singh", plazaName: "NH-24 Delhi",
    status: "active", lastActive: "2.5 hrs ago", unauthorizedAttempts: 0, allocatedAt: "2024-04-01",
  },
];

export const MOCK_OPERATORS: AdminOperator[] = [
  {
    id: "OPR001", userId: "OPR001", name: "Rajan Mehta", mobile: "9811234567", email: "rajan@spectra.in",
    plazaId: "PLZ001", plazaName: "NH-48 Gurugram Plaza", status: "active",
    lastLogin: "Today, 08:15 AM", loginCount: 142, deviceCount: 1, createdAt: "2024-01-15",
  },
  {
    id: "OPR002", userId: "OPR002", name: "Kavita Joshi", mobile: "9822345678", email: "kavita@spectra.in",
    plazaId: "PLZ002", plazaName: "NH-8 Manesar Plaza", status: "active",
    lastLogin: "Today, 09:02 AM", loginCount: 98, deviceCount: 1, createdAt: "2024-02-01",
  },
  {
    id: "OPR003", userId: "OPR003", name: "Arun Patel", mobile: "9833456789", email: "arun@spectra.in",
    plazaId: "PLZ003", plazaName: "NH-44 Panipat Plaza", status: "active",
    lastLogin: "Today, 07:48 AM", loginCount: 87, deviceCount: 1, createdAt: "2024-02-20",
  },
  {
    id: "OPR004", userId: "OPR004", name: "Shreya Singh", mobile: "9844567890", email: "shreya@spectra.in",
    plazaId: "PLZ005", plazaName: "NH-24 Delhi Toll", status: "suspended",
    lastLogin: "3 days ago", loginCount: 54, deviceCount: 1, createdAt: "2024-03-10",
  },
  {
    id: "OPR005", userId: "OPR005", name: "Vikram Rao", mobile: "9855678901", email: "vikram@spectra.in",
    plazaId: "", plazaName: "Unassigned", status: "pending",
    lastLogin: "Never", loginCount: 0, deviceCount: 0, createdAt: "2024-05-15",
  },
];

export const MOCK_SECURITY_EVENTS: SecurityEvent[] = [
  {
    id: "SEC001", type: "unauthorized_device", severity: "high",
    description: "Unauthorized device attempted to access SpectraID system",
    deviceId: "DEV004", operatorName: "Unknown", timestamp: "Today 06:41 AM", resolved: false,
  },
  {
    id: "SEC002", type: "failed_login", severity: "medium",
    description: "3 failed login attempts on OPR004 account",
    operatorId: "OPR004", operatorName: "Shreya Singh", timestamp: "Yesterday 11:22 PM", resolved: true,
  },
  {
    id: "SEC003", type: "unauthorized_device", severity: "high",
    description: "OnePlus 11 (IMEI: 360..123) blocked after 4 unauthorized attempts",
    deviceId: "DEV004", operatorName: "Unknown", timestamp: "3 days ago", resolved: true,
  },
  {
    id: "SEC004", type: "suspicious_activity", severity: "medium",
    description: "Unusual attendance pattern detected at NH-8 Manesar Plaza",
    operatorId: "OPR002", operatorName: "Kavita Joshi", timestamp: "2 days ago", resolved: false,
  },
  {
    id: "SEC005", type: "password_reset", severity: "low",
    description: "Admin reset password for operator OPR004",
    operatorId: "OPR004", operatorName: "Shreya Singh", timestamp: "3 days ago", resolved: true,
  },
  {
    id: "SEC006", type: "blocked_access", severity: "high",
    description: "Access blocked: iPhone 12 not in authorized device list",
    deviceId: "UNKNOWN", operatorName: "Unknown", timestamp: "4 days ago", resolved: true,
  },
];

export const MOCK_AUDIT_LOGS: AuditLog[] = [
  { id: "AUD001", action: "Operator Suspended", performedBy: "ADMIN001", targetType: "Operator", targetId: "OPR004", details: "Account suspended due to policy violation", timestamp: "3 days ago" },
  { id: "AUD002", action: "Device Blocked", performedBy: "ADMIN001", targetType: "Device", targetId: "DEV004", details: "Blocked after 4 unauthorized attempts", timestamp: "3 days ago" },
  { id: "AUD003", action: "Worker Transferred", performedBy: "OPR001", targetType: "Worker", targetId: "WRK003", details: "Transferred from Site-A Delhi to Site-B Mumbai", timestamp: "5 days ago" },
  { id: "AUD004", action: "Plaza Created", performedBy: "ADMIN001", targetType: "TollPlaza", targetId: "PLZ005", details: "NH-24 Delhi Toll plaza registered", timestamp: "1 week ago" },
  { id: "AUD005", action: "Device Allocated", performedBy: "ADMIN001", targetType: "Device", targetId: "DEV006", details: "Xiaomi Redmi Note 12 allocated to OPR004", timestamp: "1 week ago" },
  { id: "AUD006", action: "Operator Created", performedBy: "ADMIN001", targetType: "Operator", targetId: "OPR005", details: "New operator account created for Vikram Rao", timestamp: "2 weeks ago" },
];

export const MOCK_PLAZA_ATTENDANCE: PlazaAttendanceSummary[] = [
  { plazaId: "PLZ001", plazaName: "NH-48 Gurugram", route: "NH-48", totalWorkers: 32, present: 30, absent: 2, late: 1, attendancePct: 94, lastUpdate: "10 mins ago" },
  { plazaId: "PLZ002", plazaName: "NH-8 Manesar", route: "NH-8", totalWorkers: 28, present: 24, absent: 4, late: 2, attendancePct: 86, lastUpdate: "25 mins ago" },
  { plazaId: "PLZ003", plazaName: "NH-44 Panipat", route: "NH-44", totalWorkers: 25, present: 23, absent: 2, late: 0, attendancePct: 92, lastUpdate: "1 hr ago" },
  { plazaId: "PLZ005", plazaName: "NH-24 Delhi", route: "NH-24", totalWorkers: 18, present: 15, absent: 3, late: 2, attendancePct: 83, lastUpdate: "3 hrs ago" },
];

export function getAdminKpis() {
  const totalPlazas = MOCK_TOLL_PLAZAS.length;
  const activePlazas = MOCK_TOLL_PLAZAS.filter((p) => p.status === "active").length;
  const totalOperators = MOCK_OPERATORS.length;
  const activeOperators = MOCK_OPERATORS.filter((o) => o.status === "active").length;
  const totalWorkers = MOCK_TOLL_PLAZAS.reduce((s, p) => s + p.workerCount, 0);
  const presentToday = MOCK_PLAZA_ATTENDANCE.reduce((s, p) => s + p.present, 0);
  const absentToday = MOCK_PLAZA_ATTENDANCE.reduce((s, p) => s + p.absent, 0);
  const activeDevices = MOCK_DEVICES.filter((d) => d.status === "active").length;
  const unauthorizedAttempts = MOCK_SECURITY_EVENTS.filter((e) => e.type === "unauthorized_device" && !e.resolved).length;
  const pendingSync = 7;
  return { totalPlazas, activePlazas, totalOperators, activeOperators, totalWorkers, presentToday, absentToday, activeDevices, unauthorizedAttempts, pendingSync };
}
