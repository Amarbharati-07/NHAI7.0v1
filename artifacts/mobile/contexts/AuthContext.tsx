import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import {
  getOrCreateDeviceToken,
  verifyDevice,
  initDemoData,
} from "@/services/deviceService";
import { loginWithApi } from "@/services/authApi";
import { clearResolvedApiBase, isApiConfigured, withTimeout } from "@/services/apiConfig";
import { bootstrapOperatorOfflineData } from "@/services/offlineBootstrapService";
import { syncPlazaGeofenceFromUser, validateOperatorGeofence } from "@/services/locationService";
import {
  saveOfflineCredentials,
  verifyOfflineCredentials,
  updateOfflineProfile,
} from "@/services/offlineAuthService";
import { syncService } from "@/services/SyncService";
import {
  friendlyApiUnreachableMessage,
  friendlyConnectionMessage,
  isApiUnreachableError,
} from "@/services/userMessages";
import type { AuthUser } from "@/types/auth";

const DEMO_ADMIN_USER_ID = "ADMIN001";
const DEMO_ADMIN_PASSWORD = "admin123";
const DEMO_OPERATOR_USER_ID = "OPR001";
const DEMO_OPERATOR_PASSWORD = "opr123";

export type { AuthUser };

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (userId: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshDeviceAuth: () => Promise<AuthUser | null>;
}

async function buildOperatorContext(userId: string): Promise<Partial<AuthUser>> {
  const result = await verifyDevice(userId);
  const deviceToken = await getOrCreateDeviceToken();
  console.info("DEVICE_VERIFICATION", {
    userId,
    authorized: result.authorized,
    reason: result.reason,
    plazaId: result.plazaId,
    deviceId: result.deviceId,
  });
  return {
    plazaId: result.plazaId,
    plazaName: result.plazaName,
    allocatedDeviceId: result.deviceId,
    deviceToken,
    isDeviceAuthorized: result.authorized,
    deviceVerifyReason: result.reason,
  };
}

function mergeAuthUserSnapshot(existing: AuthUser | null, next: AuthUser): AuthUser {
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

async function finalizeOperatorUser(
  base: AuthUser,
  options: { validateGeofence?: boolean } = {},
): Promise<AuthUser> {
  let merged: AuthUser = base;

  try {
    console.info("[AuthContext] restore bootstrap start", { userId: base.userId });
    const bootstrapped = await withTimeout(
      bootstrapOperatorOfflineData(base.userId),
      12000,
      "Restore operator bootstrap",
    );
    if (bootstrapped) {
      merged = mergeAuthUserSnapshot(base, bootstrapped);
      console.info("[AuthContext] restore bootstrap result", {
        userId: merged.userId,
        plazaId: merged.plazaId ?? "",
        deviceId: merged.allocatedDeviceId ?? "",
      });
    }
  } catch (err) {
    console.warn("[AuthContext] restore bootstrap failed:", err);
  }

  try {
    console.info("[AuthContext] restore device context start", { userId: merged.userId });
    const ctx = await withTimeout(
      buildOperatorContext(merged.userId),
      5000,
      "Restore operator device context",
    );
    const next = mergeAuthUserSnapshot(merged, { ...merged, ...ctx });
    console.info("[AuthContext] restore device context result", {
      userId: next.userId,
      plazaId: next.plazaId ?? "",
      deviceId: next.allocatedDeviceId ?? "",
      authorized: next.isDeviceAuthorized,
    });
    merged = next;
  } catch (err) {
    console.warn("[AuthContext] restore device context failed:", err);
  }

  try {
    if (merged.role === "operator") {
      await syncPlazaGeofenceFromUser(merged);
    }
    if (merged.role === "operator" && options.validateGeofence !== false) {
      const geofence = await withTimeout(
        validateOperatorGeofence(merged),
        8000,
        "Validate operator geofence",
      );
      merged = mergeAuthUserSnapshot(merged, {
        ...merged,
        geofenceAllowed: geofence.allowed,
        geofenceDistanceMeters: geofence.distanceMeters ?? undefined,
        geofenceCheckedAt: geofence.checkedAt,
        geofenceMessage: geofence.message,
      });
      console.info("[AuthContext] geofence validation result", {
        userId: merged.userId,
        allowed: geofence.allowed,
        distanceMeters: geofence.distanceMeters,
      });
    }
  } catch (err) {
    console.warn("[AuthContext] geofence validation failed:", err);
    merged = mergeAuthUserSnapshot(merged, {
      ...merged,
      geofenceAllowed: false,
      geofenceCheckedAt: new Date().toISOString(),
      geofenceMessage: friendlyConnectionMessage(),
    });
  }

  return merged;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => ({ ok: false }),
  logout: async () => {},
  refreshDeviceAuth: async () => null,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        clearResolvedApiBase();
        if (!isApiConfigured()) {
          await initDemoData();
        }
        const stored = await AsyncStorage.getItem("@spectra_user");
        console.info("SESSION_RESTORE", {
          hasStoredSession: Boolean(stored),
        });
        if (stored) {
          const u: AuthUser = JSON.parse(stored);
          console.info("SESSION_RESTORE", {
            userId: u.userId,
            role: u.role,
            plazaId: u.plazaId ?? "",
            deviceId: u.allocatedDeviceId ?? "",
            hasDeviceToken: Boolean(u.deviceToken),
            authorized: u.isDeviceAuthorized,
          });
          if (u.role === "operator") {
            if (!cancelled) {
              setUser(u);
            }
            void (async () => {
              try {
                const updated = await finalizeOperatorUser(u, { validateGeofence: false });
                if (cancelled) return;
                const previous = JSON.parse((await AsyncStorage.getItem("@spectra_user")) ?? "null") as AuthUser | null;
                const merged = mergeAuthUserSnapshot(previous ?? u, updated);
                await AsyncStorage.setItem("@spectra_user", JSON.stringify(merged));
                await updateOfflineProfile(merged.userId, merged);
                console.info("SESSION_SAVE", {
                  userId: merged.userId,
                  plazaId: merged.plazaId ?? "",
                  deviceId: merged.allocatedDeviceId ?? "",
                  authorized: merged.isDeviceAuthorized,
                });
                setUser(merged);
              } catch (err) {
                console.warn("[AuthContext] operator session restore failed:", err);
              }
            })();
          } else {
            if (!cancelled) {
              setUser(u);
            }
          }
        }
      } catch (err) {
        console.warn("[AuthContext] restore session failed:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistUser = async (authUser: AuthUser) => {
    const existingRaw = await AsyncStorage.getItem("@spectra_user");
    const existing = existingRaw ? (JSON.parse(existingRaw) as AuthUser) : null;
    const merged = mergeAuthUserSnapshot(existing, authUser);
    await AsyncStorage.setItem("@spectra_user", JSON.stringify(merged));
    console.info("SESSION_SAVE", {
      userId: merged.userId,
      plazaId: merged.plazaId ?? "",
      deviceId: merged.allocatedDeviceId ?? "",
      authorized: merged.isDeviceAuthorized,
    });
    setUser(merged);
  };

  const clearPersistedUser = async () => {
    await AsyncStorage.removeItem("@spectra_user");
    setUser(null);
  };

  const login = async (
    userId: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      clearResolvedApiBase();
      const apiResult = await loginWithApi(userId, password);

      if ("user" in apiResult) {
        let authUser: AuthUser = { ...apiResult.user };

        if (authUser.role === "operator") {
          try {
            const localDeviceToken = await getOrCreateDeviceToken();
            if (apiResult.device) {
              const { ensureOperatorAllocationFromBootstrap } = await import(
                "@/services/deviceService"
              );
              await ensureOperatorAllocationFromBootstrap(
                {
                  userId: authUser.userId,
                  name: authUser.name,
                  plazaId: authUser.plazaId ?? "",
                  plazaName: authUser.plazaName ?? "Unassigned",
                  loginCount: authUser.loginCount,
                },
                {
                  ...apiResult.device,
                  deviceType: apiResult.device.deviceType,
                },
                localDeviceToken,
              );
            }
            authUser = await finalizeOperatorUser(authUser);
          } catch (err) {
            console.warn("[AuthContext] operator login finalize failed:", err);
          }
        }

        await persistUser(authUser);

        void (async () => {
          try {
            await withTimeout(
              saveOfflineCredentials(authUser.userId, password, authUser),
              5000,
              "Cache offline credentials",
            );
          } catch (err) {
            console.warn("[AuthContext] offline credential cache failed:", err);
          }
        })();
        return { ok: true };
      }

      const isNetworkError =
        isApiUnreachableError(apiResult.error) ||
        apiResult.error?.includes("Cannot reach server") ||
        apiResult.error?.includes("did not respond in time");

      if (isNetworkError) {
        const normalizedUserId = userId.trim().toUpperCase();
        const isDemoAdmin =
          normalizedUserId === DEMO_ADMIN_USER_ID && password === DEMO_ADMIN_PASSWORD;
        const isDemoOperator =
          normalizedUserId === DEMO_OPERATOR_USER_ID && password === DEMO_OPERATOR_PASSWORD;

        if (isDemoAdmin || isDemoOperator) {
          await initDemoData();
          const demoUser: AuthUser = isDemoAdmin
            ? {
                id: 0,
                userId: DEMO_ADMIN_USER_ID,
                name: "System Admin",
                role: "admin",
              }
            : {
                id: 1,
                userId: DEMO_OPERATOR_USER_ID,
                name: "Rajan Mehta",
                role: "operator",
                plazaId: "PLZ001",
                plazaName: "NH-48 Gurugram Plaza",
                status: "active",
              };

          const authUser =
            demoUser.role === "operator"
              ? await finalizeOperatorUser(demoUser, { validateGeofence: false })
              : demoUser;

          await persistUser(authUser);
          void (async () => {
            try {
              await saveOfflineCredentials(authUser.userId, password, authUser);
            } catch (err) {
              console.warn("[AuthContext] demo credential cache failed:", err);
            }
          })();
          return { ok: true };
        }

        const offlineUser = await verifyOfflineCredentials(userId, password);
        if (offlineUser) {
          const authUser =
            offlineUser.role === "operator"
              ? await finalizeOperatorUser(offlineUser, { validateGeofence: false })
              : offlineUser;
          await persistUser(authUser);
          return { ok: true };
        }
        await clearPersistedUser();
        return {
          ok: false,
          error:
            "Offline login failed. Please sign in once while connected, then try again offline.",
        };
      }

      await clearPersistedUser();
      return {
        ok: false,
        error: isApiUnreachableError(apiResult.error)
          ? friendlyApiUnreachableMessage()
          : apiResult.error ?? friendlyConnectionMessage(),
      };
    } catch (err) {
      console.error("[AuthContext] login failed:", err);
      await clearPersistedUser();
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err ?? friendlyConnectionMessage()),
      };
    }
  };

  const refreshDeviceAuth = async (): Promise<AuthUser | null> => {
    if (!user || user.role !== "operator") return null;
    try {
      if (syncService.getState().isOnline && isApiConfigured()) {
        console.info("BOOTSTRAP_RESPONSE", {
          userId: user.userId,
          plazaId: user.plazaId ?? "",
          deviceId: user.allocatedDeviceId ?? "",
          phase: "refresh_start",
        });
        await withTimeout(
          bootstrapOperatorOfflineData(user.userId),
          12000,
          "Refresh operator bootstrap",
        );
      }
      const ctx = await withTimeout(
        buildOperatorContext(user.userId),
        5000,
        "Refresh operator device context",
      );
      let updated = mergeAuthUserSnapshot(user, { ...user, ...ctx });
      await syncPlazaGeofenceFromUser(updated);
      const geofence = await withTimeout(
        validateOperatorGeofence(updated),
        8000,
        "Refresh operator geofence",
      );
      updated = mergeAuthUserSnapshot(updated, {
        ...updated,
        geofenceAllowed: geofence.allowed,
        geofenceDistanceMeters: geofence.distanceMeters ?? undefined,
        geofenceCheckedAt: geofence.checkedAt,
        geofenceMessage: geofence.message,
      });
      await persistUser(updated);
      await updateOfflineProfile(updated.userId, updated);
      console.info("BOOTSTRAP_RESPONSE", {
        userId: updated.userId,
        plazaId: updated.plazaId ?? "",
        deviceId: updated.allocatedDeviceId ?? "",
        phase: "refresh_persisted",
        authorized: updated.isDeviceAuthorized,
      });
      setUser(updated);
      return updated;
    } catch (err) {
      console.warn("[AuthContext] refreshDeviceAuth failed:", err);
      return null;
    }
  };

  const logout = async () => {
    console.info("[AuthContext] logout", { userId: user?.userId ?? "" });
    await AsyncStorage.removeItem("@spectra_user");
    setUser(null);
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        console.info("APP_FOREGROUND", { userId: user?.userId ?? "", role: user?.role ?? "" });
      } else {
        console.info("APP_BACKGROUND", { nextState, userId: user?.userId ?? "", role: user?.role ?? "" });
      }
    });
    return () => subscription.remove();
  }, [user?.role, user?.userId]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshDeviceAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
