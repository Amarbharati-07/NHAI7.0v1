import type { DeviceVerifyReason } from "@/services/deviceService";

export interface AuthUser {
  id: number;
  userId: string;
  name: string;
  role: "admin" | "operator";
  plazaId?: string;
  plazaName?: string;
  status?: string;
  allocatedDeviceId?: string;
  deviceToken?: string;
  isDeviceAuthorized?: boolean;
  deviceVerifyReason?: DeviceVerifyReason;
}
