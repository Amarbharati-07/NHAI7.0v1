import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { apiPostJson, isApiConfigured } from "./apiConfig";
import type { AuthUser } from "@/types/auth";
import { friendlyGeofenceMessage, plazaGpsNotConfiguredMessage } from "./userMessages";

export interface GpsLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface PlazaGeofence {
  plazaId: string;
  plazaName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  updatedAt: string;
}

export interface GeofenceResult {
  inBounds: boolean;
  distance: number;
  plazaName: string;
  radiusMeters: number;
  latitude: number;
  longitude: number;
  configured: boolean;
  message: string;
}

export interface GeofenceValidationResult {
  allowed: boolean;
  distanceMeters: number | null;
  message: string;
  plaza: PlazaGeofence | null;
  location: GpsLocation | null;
  checkedAt: string;
  configured: boolean;
}

export interface GeofenceAttemptLog {
  operatorId: string;
  plazaId: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  result: "allowed" | "blocked";
  timestamp: string;
}

const PLAZA_CACHE_PREFIX = "@spectra_plaza_geofence_";
const GEOFENCE_LOG_QUEUE_KEY = "@spectra_geofence_log_queue_v1";

function cacheKey(plazaId: string): string {
  return `${PLAZA_CACHE_PREFIX}${plazaId.toUpperCase()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function distanceBetween(
  currentLatitude: number,
  currentLongitude: number,
  plazaLatitude: number,
  plazaLongitude: number,
): number {
  return haversineMeters(currentLatitude, currentLongitude, plazaLatitude, plazaLongitude);
}

export async function requestLocationPermission(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function getCurrentLocation(): Promise<GpsLocation | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function cachePlazaGeofence(plaza: PlazaGeofence): Promise<void> {
  await AsyncStorage.setItem(cacheKey(plaza.plazaId), JSON.stringify(plaza));
}

export async function getCachedPlazaGeofence(plazaId: string): Promise<PlazaGeofence | null> {
  const raw = await AsyncStorage.getItem(cacheKey(plazaId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlazaGeofence;
  } catch {
    return null;
  }
}

export async function syncPlazaGeofenceFromUser(user: Pick<AuthUser, "plazaId" | "plazaName" | "plazaLatitude" | "plazaLongitude" | "plazaRadiusMeters">): Promise<PlazaGeofence | null> {
  const plazaId = String(user.plazaId ?? "").trim();
  const latitude = user.plazaLatitude;
  const longitude = user.plazaLongitude;
  if (!plazaId || latitude == null || longitude == null) {
    return getCachedPlazaGeofence(plazaId);
  }
  const geofence: PlazaGeofence = {
    plazaId: plazaId.toUpperCase(),
    plazaName: user.plazaName ?? plazaId,
    latitude: Number(latitude),
    longitude: Number(longitude),
    radiusMeters: Number(user.plazaRadiusMeters ?? 300),
    updatedAt: nowIso(),
  };
  await cachePlazaGeofence(geofence);
  return geofence;
}

async function resolvePlazaGeofence(plazaId: string): Promise<PlazaGeofence | null> {
  const normalized = plazaId.trim().toUpperCase();
  if (!normalized) return null;

  return getCachedPlazaGeofence(normalized);
}

export async function checkGeofence(plazaId: string, lat: number, lon: number): Promise<GeofenceResult> {
  const plaza = await resolvePlazaGeofence(plazaId);
  if (!plaza) {
    return {
      inBounds: true,
      distance: 0,
      plazaName: "Unknown",
      radiusMeters: 300,
      latitude: lat,
      longitude: lon,
      configured: false,
      message: plazaGpsNotConfiguredMessage(),
    };
  }

  const distance = Math.round(distanceBetween(lat, lon, plaza.latitude, plaza.longitude));
  return {
    inBounds: distance <= plaza.radiusMeters,
    distance,
    plazaName: plaza.plazaName,
    radiusMeters: plaza.radiusMeters,
    latitude: plaza.latitude,
    longitude: plaza.longitude,
    configured: true,
    message: distance <= plaza.radiusMeters ? "" : friendlyGeofenceMessage(),
  };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

async function readPendingGeofenceLogs(): Promise<GeofenceAttemptLog[]> {
  const raw = await AsyncStorage.getItem(GEOFENCE_LOG_QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as GeofenceAttemptLog[];
  } catch {
    return [];
  }
}

async function writePendingGeofenceLogs(entries: GeofenceAttemptLog[]): Promise<void> {
  await AsyncStorage.setItem(GEOFENCE_LOG_QUEUE_KEY, JSON.stringify(entries));
}

export async function recordGeofenceAttempt(log: Omit<GeofenceAttemptLog, "timestamp"> & { timestamp?: string }): Promise<void> {
  const entry: GeofenceAttemptLog = {
    ...log,
    timestamp: log.timestamp ?? nowIso(),
  };

  if (isApiConfigured()) {
    try {
      await apiPostJson("geofence/events", {
        operatorId: entry.operatorId,
        plazaId: entry.plazaId,
        latitude: entry.latitude,
        longitude: entry.longitude,
        distanceMeters: entry.distanceMeters,
        result: entry.result,
        timestamp: entry.timestamp,
      }, 8_000);
      return;
    } catch (err) {
      console.warn("[geofence] remote log failed, storing locally:", err);
    }
  }

  const queue = await readPendingGeofenceLogs();
  queue.push(entry);
  await writePendingGeofenceLogs(queue);
}

export async function flushPendingGeofenceLogs(): Promise<void> {
  const queue = await readPendingGeofenceLogs();
  if (queue.length === 0 || !isApiConfigured()) return;

  const remaining: GeofenceAttemptLog[] = [];
  for (const entry of queue) {
    try {
      await apiPostJson("geofence/events", entry, 8_000);
    } catch {
      remaining.push(entry);
    }
  }
  await writePendingGeofenceLogs(remaining);
}

export async function validateOperatorGeofence(
  user: Pick<AuthUser, "userId" | "plazaId" | "plazaName" | "plazaLatitude" | "plazaLongitude" | "plazaRadiusMeters">,
): Promise<GeofenceValidationResult> {
  const plaza = await syncPlazaGeofenceFromUser(user);
  const checkedAt = nowIso();
  if (!plaza) {
    return {
      allowed: false,
      distanceMeters: null,
      message: plazaGpsNotConfiguredMessage(),
      plaza: null,
      location: null,
      checkedAt,
      configured: false,
    };
  }

  if (plaza.latitude == null || plaza.longitude == null) {
    return {
      allowed: false,
      distanceMeters: null,
      message: plazaGpsNotConfiguredMessage(),
      plaza,
      location: null,
      checkedAt,
      configured: false,
    };
  }

  console.info("[geofence] validation start", {
    plazaId: plaza.plazaId,
    plazaLatitude: plaza.latitude,
    plazaLongitude: plaza.longitude,
    radiusMeters: plaza.radiusMeters,
  });

  const permissionGranted = await requestLocationPermission();
  if (!permissionGranted) {
    return {
      allowed: false,
      distanceMeters: null,
      message: friendlyGeofenceMessage(),
      plaza,
      location: null,
      checkedAt,
      configured: true,
    };
  }

  const location = await getCurrentLocation();
  if (!location) {
    return {
      allowed: false,
      distanceMeters: null,
      message: friendlyGeofenceMessage(),
      plaza,
      location: null,
      checkedAt,
      configured: true,
    };
  }

  const distanceMeters = Math.round(
    distanceBetween(location.latitude, location.longitude, plaza.latitude, plaza.longitude),
  );
  const allowed = distanceMeters <= plaza.radiusMeters;

  console.info("[geofence] validation", {
    plazaId: plaza.plazaId,
    plazaLatitude: plaza.latitude,
    plazaLongitude: plaza.longitude,
    currentLatitude: location.latitude,
    currentLongitude: location.longitude,
    distanceMeters,
    radiusMeters: plaza.radiusMeters,
  });

  await recordGeofenceAttempt({
    operatorId: user.userId,
    plazaId: plaza.plazaId,
    latitude: location.latitude,
    longitude: location.longitude,
    distanceMeters,
    result: allowed ? "allowed" : "blocked",
    timestamp: checkedAt,
  });

  return {
    allowed,
    distanceMeters,
    message: allowed ? "" : friendlyGeofenceMessage(),
    plaza,
    location,
    checkedAt,
    configured: true,
  };
}

export async function validateStoredOperatorGeofence(): Promise<GeofenceValidationResult | null> {
  const raw = await AsyncStorage.getItem("@spectra_user");
  if (!raw) return null;
  try {
    const user = JSON.parse(raw) as AuthUser;
    if (user.role !== "operator" || !user.userId) return null;
    return validateOperatorGeofence({
      userId: user.userId,
      plazaId: user.plazaId ?? "",
      plazaName: user.plazaName ?? "",
      plazaLatitude: user.plazaLatitude ?? null,
      plazaLongitude: user.plazaLongitude ?? null,
      plazaRadiusMeters: user.plazaRadiusMeters ?? 300,
    });
  } catch {
    return null;
  }
}
