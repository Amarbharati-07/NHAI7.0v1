import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { AuthUser } from "@/types/auth";

/**
 * Pure-JS UUID v4 generator (RFC 4122).
 *
 * `Crypto.randomUUID()` from expo-crypto requires the native `ExpoCryptoAES`
 * module which is NOT bundled inside Expo Go (SDK 54). It is only available
 * in custom development builds.  We only need a random salt string here, so
 * a Math.random()-based implementation is perfectly adequate.
 */
function randomUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const CRED_INDEX_KEY = "@spectra_offline_cred_index";

interface StoredCredential {
  passwordHash: string;
  salt: string;
  updatedAt: string;
}

function mergeProfile(existing: AuthUser | null, next: AuthUser): AuthUser {
  return {
    ...(existing ?? {}),
    ...next,
    plazaId: next.plazaId ?? existing?.plazaId,
    plazaName: next.plazaName ?? existing?.plazaName,
    plazaLatitude: next.plazaLatitude ?? existing?.plazaLatitude,
    plazaLongitude: next.plazaLongitude ?? existing?.plazaLongitude,
    plazaRadiusMeters: next.plazaRadiusMeters ?? existing?.plazaRadiusMeters,
    status: next.status ?? existing?.status,
    allocatedDeviceId: next.allocatedDeviceId ?? existing?.allocatedDeviceId,
    deviceToken: next.deviceToken ?? existing?.deviceToken,
    isDeviceAuthorized: next.isDeviceAuthorized ?? existing?.isDeviceAuthorized,
    deviceVerifyReason: next.deviceVerifyReason ?? existing?.deviceVerifyReason,
    geofenceAllowed: next.geofenceAllowed ?? existing?.geofenceAllowed,
    geofenceDistanceMeters: next.geofenceDistanceMeters ?? existing?.geofenceDistanceMeters,
    geofenceCheckedAt: next.geofenceCheckedAt ?? existing?.geofenceCheckedAt,
    geofenceMessage: next.geofenceMessage ?? existing?.geofenceMessage,
  };
}

function credKey(userId: string): string {
  return `spectra_offline_cred_${userId.toUpperCase()}`;
}

function profileKey(userId: string): string {
  return `@spectra_offline_profile_${userId.toUpperCase()}`;
}

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(`@secure_${key}`, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(`@secure_${key}`);
  }
  return SecureStore.getItemAsync(key);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(`@secure_${key}`);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`,
  );
}

/** Save salted password hash (SecureStore) + profile (AsyncStorage) after online login. */
export async function saveOfflineCredentials(
  userId: string,
  password: string,
  profile: AuthUser,
): Promise<void> {
  const uid = userId.toUpperCase();
  const salt = randomUUID();
  const passwordHash = await hashPassword(password, salt);
  const cred: StoredCredential = { passwordHash, salt, updatedAt: new Date().toISOString() };
  await secureSet(credKey(uid), JSON.stringify(cred));
  await AsyncStorage.setItem(profileKey(uid), JSON.stringify(profile));

  const indexRaw = await AsyncStorage.getItem(CRED_INDEX_KEY);
  const index: string[] = indexRaw ? (JSON.parse(indexRaw) as string[]) : [];
  if (!index.includes(uid)) {
    index.push(uid);
    await AsyncStorage.setItem(CRED_INDEX_KEY, JSON.stringify(index));
  }
}

/** Update cached profile without changing password (e.g. after bootstrap). */
export async function updateOfflineProfile(userId: string, profile: AuthUser): Promise<void> {
  const key = profileKey(userId.toUpperCase());
  const existingRaw = await AsyncStorage.getItem(key);
  const existing = existingRaw ? (JSON.parse(existingRaw) as AuthUser) : null;
  const merged = mergeProfile(existing, profile);
  await AsyncStorage.setItem(key, JSON.stringify(merged));
  console.info("[offlineAuth] profile updated", {
    userId: merged.userId,
    plazaId: merged.plazaId ?? "",
    deviceId: merged.allocatedDeviceId ?? "",
    authorized: merged.isDeviceAuthorized,
  });
}

export async function verifyOfflineCredentials(
  userId: string,
  password: string,
): Promise<AuthUser | null> {
  const uid = userId.toUpperCase();
  const credRaw = await secureGet(credKey(uid));
  if (!credRaw) return null;

  const cred = JSON.parse(credRaw) as StoredCredential;
  const hash = await hashPassword(password, cred.salt);
  if (hash !== cred.passwordHash) return null;

  const profileRaw = await AsyncStorage.getItem(profileKey(uid));
  if (!profileRaw) return null;
  return JSON.parse(profileRaw) as AuthUser;
}

export async function getOfflineProfile(userId: string): Promise<AuthUser | null> {
  const profileRaw = await AsyncStorage.getItem(profileKey(userId.toUpperCase()));
  return profileRaw ? (JSON.parse(profileRaw) as AuthUser) : null;
}

export async function hasOfflineCredentials(userId: string): Promise<boolean> {
  return !!(await secureGet(credKey(userId.toUpperCase())));
}

export async function clearOfflineCredentials(userId: string): Promise<void> {
  const uid = userId.toUpperCase();
  await secureDelete(credKey(uid));
  await AsyncStorage.removeItem(profileKey(uid));

  const indexRaw = await AsyncStorage.getItem(CRED_INDEX_KEY);
  if (!indexRaw) return;
  const index = (JSON.parse(indexRaw) as string[]).filter((id) => id !== uid);
  await AsyncStorage.setItem(CRED_INDEX_KEY, JSON.stringify(index));
}
