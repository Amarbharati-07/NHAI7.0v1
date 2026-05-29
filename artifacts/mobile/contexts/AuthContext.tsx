import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

interface AuthUser {
  id: number;
  userId: string;
  name: string;
  role: "admin" | "operator";
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (userId: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => false,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("@spectra_user");
        if (stored) setUser(JSON.parse(stored));
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const login = async (userId: string, password: string): Promise<boolean> => {
    const validUsers = [
      { id: 1, userId: "ADMIN001", password: "admin123", name: "System Admin", role: "admin" as const },
      { id: 2, userId: "OPR001", password: "opr123", name: "John Operator", role: "operator" as const },
    ];
    const match = validUsers.find((u) => u.userId === userId && u.password === password);
    if (match) {
      const authUser: AuthUser = { id: match.id, userId: match.userId, name: match.name, role: match.role };
      await AsyncStorage.setItem("@spectra_user", JSON.stringify(authUser));
      setUser(authUser);
      return true;
    }
    return false;
  };

  const logout = async () => {
    await AsyncStorage.removeItem("@spectra_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
