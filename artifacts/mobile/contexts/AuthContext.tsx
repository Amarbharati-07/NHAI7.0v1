import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getOrCreateDeviceToken,
  verifyDevice,
  initDemoData,
} from "@/services/deviceService";
import { loginWithApi } from "@/services/authApi";
import { isApiConfigured } from "@/services/apiConfig";
import { bootstrapOperatorOfflineData } from "@/services/offlineBootstrapService";
import {
  saveOfflineCredentials,
  verifyOfflineCredentials,
  updateOfflineProfile,
} from "@/services/offlineAuthService";
import { syncService } from "@/services/SyncService";
import type { AuthUser } from "@/types/auth";

export type { AuthUser };

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (userId: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshDeviceAuth: () => Promise<void>;
}

async function buildOperatorContext(userId: string): Promise<Partial<AuthUser>> {
  const result = await verifyDevice(userId);
  const deviceToken = await getOrCreateDeviceToken();
  return {
    plazaId: result.plazaId,
    plazaName: result.plazaName,
    allocatedDeviceId: result.deviceId,
    deviceToken,
    isDeviceAuthorized: result.authorized,
    deviceVerifyReason: result.reason,
  };
}

async function finalizeOperatorUser(base: AuthUser): Promise<AuthUser> {
  const bootstrapped = await bootstrapOperatorOfflineData(base.userId);
  const merged: AuthUser = bootstrapped ? { ...base, ...bootstrapped } : base;
  const ctx = await buildOperatorContext(merged.userId);
  return { ...merged, ...ctx };
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => ({ ok: false }),
  logout: async () => {},
  refreshDeviceAuth: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!isApiConfigured()) {
          await initDemoData();
        }
        const stored = await AsyncStorage.getItem("@spectra_user");
        if (stored) {
          const u: AuthUser = JSON.parse(stored);
          if (u.role === "operator") {
            let authUser = u;
            if (syncService.getState().isOnline && isApiConfigured()) {
              const boot = await bootstrapOperatorOfflineData(u.userId);
              if (boot) authUser = { ...authUser, ...boot };
            }
            const ctx = await buildOperatorContext(authUser.userId);
            const updated = { ...authUser, ...ctx };
            await AsyncStorage.setItem("@spectra_user", JSON.stringify(updated));
            await updateOfflineProfile(updated.userId, updated);
            setUser(updated);
          } else {
            setUser(u);
          }
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    })();
  }, []);

  const persistUser = async (authUser: AuthUser) => {
    await AsyncStorage.setItem("@spectra_user", JSON.stringify(authUser));
    setUser(authUser);
  };

  const login = async (
    userId: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    const apiResult = await loginWithApi(userId, password);

    if ("user" in apiResult) {
      let authUser: AuthUser = { ...apiResult.user };
      await saveOfflineCredentials(userId, password, authUser);
      if (authUser.role === "operator") {
        authUser = await finalizeOperatorUser(authUser);
      }
      await persistUser(authUser);
      return { ok: true };
    }

    const isNetworkError =
      apiResult.error?.includes("Cannot reach server") ||
      apiResult.error?.includes("did not respond in time");

    if (isNetworkError) {
      const offlineUser = await verifyOfflineCredentials(userId, password);
      if (offlineUser) {
        let authUser = offlineUser;
        if (authUser.role === "operator") {
          const ctx = await buildOperatorContext(authUser.userId);
          authUser = { ...authUser, ...ctx };
        }
        await persistUser(authUser);
        return { ok: true };
      }
      return {
        ok: false,
        error:
          "Offline login failed. Log in once while online to enable offline access for this account.",
      };
    }

    return { ok: false, error: apiResult.error };
  };

  const refreshDeviceAuth = async () => {
    if (!user || user.role !== "operator") return;
    if (syncService.getState().isOnline && isApiConfigured()) {
      await bootstrapOperatorOfflineData(user.userId);
    }
    const ctx = await buildOperatorContext(user.userId);
    const updated = { ...user, ...ctx };
    await AsyncStorage.setItem("@spectra_user", JSON.stringify(updated));
    await updateOfflineProfile(updated.userId, updated);
    setUser(updated);
  };

  const logout = async () => {
    await AsyncStorage.removeItem("@spectra_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshDeviceAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
