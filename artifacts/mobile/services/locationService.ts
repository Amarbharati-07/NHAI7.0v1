import * as Location from "expo-location";
import { Platform } from "react-native";

export interface GpsLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface GeofenceResult {
  inBounds: boolean;
  distance: number;
  plazaName: string;
  radiusMeters: number;
}

const PLAZA_COORDS: Record<string, { name: string; lat: number; lon: number; radius: number }> = {
  PLZ001: { name: "NH-48 Gurugram",  lat: 28.4595, lon: 77.0266, radius: 500 },
  PLZ002: { name: "NH-8 Manesar",    lat: 28.3558, lon: 76.9380, radius: 500 },
  PLZ003: { name: "NH-44 Panipat",   lat: 29.3909, lon: 76.9635, radius: 500 },
  PLZ004: { name: "NH-24 Ghaziabad", lat: 28.6726, lon: 77.4173, radius: 500 },
  PLZ005: { name: "NH-58 Meerut",    lat: 28.9845, lon: 77.7064, radius: 500 },
};

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

export async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export async function getCurrentLocation(): Promise<GpsLocation | null> {
  if (Platform.OS === "web") return null;
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

export function checkGeofence(plazaId: string, lat: number, lon: number): GeofenceResult {
  const plaza = PLAZA_COORDS[plazaId];
  if (!plaza) {
    return { inBounds: true, distance: 0, plazaName: "Unknown", radiusMeters: 500 };
  }
  const distance = Math.round(haversineMeters(lat, lon, plaza.lat, plaza.lon));
  return {
    inBounds: distance <= plaza.radius,
    distance,
    plazaName: plaza.name,
    radiusMeters: plaza.radius,
  };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
