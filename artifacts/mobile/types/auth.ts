import type { DeviceVerifyReason } from "@/services/deviceService";

export interface AuthUser {
  id: number;
  userId: string;
  name: string;
  role: "admin" | "operator";
  plazaId?: string;
  plazaName?: string;
  plazaLatitude?: number | null;
  plazaLongitude?: number | null;
  plazaRadiusMeters?: number | null;
  status?: string;
  loginCount?: number;
  allocatedDeviceId?: string;
  deviceToken?: string;
  isDeviceAuthorized?: boolean;
  deviceVerifyReason?: DeviceVerifyReason;
  geofenceAllowed?: boolean;
  geofenceDistanceMeters?: number;
  geofenceCheckedAt?: string;
  geofenceMessage?: string;
}
