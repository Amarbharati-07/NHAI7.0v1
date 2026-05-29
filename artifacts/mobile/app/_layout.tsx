import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
} from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AdminDataProvider } from "@/contexts/AdminDataContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DrawerProvider } from "@/contexts/DrawerContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { syncService } from "@/services/SyncService";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

const SQLITE_ERROR_PATTERNS = [
  "InvalidStateError",
  "VFS state",
  "OPFS",
  "sqlite",
];

if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const msg: string = event.reason?.message ?? String(event.reason ?? "");
    if (SQLITE_ERROR_PATTERNS.some((p) => msg.toLowerCase().includes(p.toLowerCase()))) {
      event.preventDefault();
    }
  });
}

export default function RootLayout() {
  useEffect(() => {
    syncService.start();
    return () => syncService.stop();
  }, []);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Ionicons.font,
    ...MaterialIcons.font,
    ...MaterialCommunityIcons.font,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <AdminDataProvider>
              <DrawerProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" options={{ animation: "none" }} />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="login" />
                    <Stack.Screen name="dashboard" />
                    <Stack.Screen name="register-worker" />
                    <Stack.Screen name="face-capture" />
                    <Stack.Screen name="camera-capture" options={{ presentation: "fullScreenModal" }} />
                    <Stack.Screen name="guided-face-capture" options={{ presentation: "fullScreenModal" }} />
                    <Stack.Screen name="liveness-camera" options={{ presentation: "fullScreenModal" }} />
                    <Stack.Screen name="attendance" />
                    <Stack.Screen name="liveness-detection" />
                    <Stack.Screen name="attendance-success" />
                    <Stack.Screen name="attendance-history" />
                    <Stack.Screen name="worker-details" />
                    <Stack.Screen name="worker-directory" />
                    <Stack.Screen name="worker-profile" />
                    <Stack.Screen name="edit-worker" />
                    <Stack.Screen name="sync-center" />
                    <Stack.Screen name="manual-attendance" />
                    <Stack.Screen name="reports" />
                    <Stack.Screen name="settings" />
                    {/* Admin screens */}
                    <Stack.Screen name="admin-toll-plazas" />
                    <Stack.Screen name="admin-devices" />
                    <Stack.Screen name="admin-operators" />
                    <Stack.Screen name="admin-workers" />
                    <Stack.Screen name="admin-security" />
                    <Stack.Screen name="admin-attendance" />
                    </Stack>
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </DrawerProvider>
              </AdminDataProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
