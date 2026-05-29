import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getOrCreateDeviceToken,
  verifyDevice,
  initDemoData,
  type DeviceVerifyReason,
} from "@/services/deviceService";

export interface AuthUser {
  id: number;
  userId: string;
  name: string;
  role: "admin" | "operator";
  /* Operator-only device context */
  plazaId?: string;
  plazaName?: string;
  allocatedDeviceId?: string;
  deviceToken?: string;
  isDeviceAuthorized?: boolean;
  deviceVerifyReason?: DeviceVerifyReason;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (userId: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshDeviceAuth: () => Promise<void>;
}

const VALID_USERS = [
  { id: 1, userId: "ADMIN001", password: "admin123", name: "System Admin",  role: "admin"    as const },
  { id: 2, userId: "OPR001",   password: "opr123",   name: "John Operator", role: "operator" as const },
];

async function buildOperatorContext(userId: string): Promise<Partial<AuthUser>> {
  const result     = await verifyDevice(userId);
  const deviceToken = await getOrCreateDeviceToken();
  return {
    plazaId:             result.plazaId,
    plazaName:           result.plazaName,
    allocatedDeviceId:   result.deviceId,
    deviceToken,
    isDeviceAuthorized:  result.authorized,
    deviceVerifyReason:  result.reason,
  };
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => false,
  logout: async () => {},
  refreshDeviceAuth: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await initDemoData();
        const stored = await AsyncStorage.getItem("@spectra_user");
        if (stored) {
          const u: AuthUser = JSON.parse(stored);
          if (u.role === "operator") {
            const ctx = await buildOperatorContext(u.userId);
            const updated = { ...u, ...ctx };
            await AsyncStorage.setItem("@spectra_user", JSON.stringify(updated));
            setUser(updated);
          } else {
            setUser(u);
          }
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = async (userId: string, password: string): Promise<boolean> => {
    const match = VALID_USERS.find((u) => u.userId === userId && u.password === password);
    if (!match) return false;

    let authUser: AuthUser = {
      id: match.id, userId: match.userId,
      name: match.name, role: match.role,
    };

    if (match.role === "operator") {
      const ctx = await buildOperatorContext(match.userId);
      authUser = { ...authUser, ...ctx };
    }

    await AsyncStorage.setItem("@spectra_user", JSON.stringify(authUser));
    setUser(authUser);
    return true;
  };

  const refreshDeviceAuth = async () => {
    if (!user || user.role !== "operator") return;
    const ctx = await buildOperatorContext(user.userId);
    const updated = { ...user, ...ctx };
    await AsyncStorage.setItem("@spectra_user", JSON.stringify(updated));
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
