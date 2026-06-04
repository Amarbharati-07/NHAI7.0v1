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
import { ActivityIndicator, LogBox, View } from "react-native";
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
import { bootstrapExpoUpdates } from "@/services/expoUpdatesBootstrap";

void SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient();

const SQLITE_ERROR_PATTERNS = [
  "InvalidStateError",
  "VFS state",
  "OPFS",
  "sqlite",
];

const REMOTE_UPDATE_ERROR_PATTERNS = [
  "Failed to download remote update",
  "Failed to fetch update",
  "remote update",
  "expo-updates",
];

function isRemoteUpdateError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error ?? "");
  return REMOTE_UPDATE_ERROR_PATTERNS.some((pattern) =>
    message.toLowerCase().includes(pattern.toLowerCase()),
  );
}

if (Platform.OS !== "web") {
  LogBox.ignoreLogs([
    "Failed to download remote update",
    "Failed to fetch update",
  ]);

  const globalErrorUtils = globalThis as typeof globalThis & {
    ErrorUtils?: {
      getGlobalHandler?: () => ((error: Error, isFatal?: boolean) => void) | undefined;
      setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  };

  const previousHandler = globalErrorUtils.ErrorUtils?.getGlobalHandler?.();
  globalErrorUtils.ErrorUtils?.setGlobalHandler((error, isFatal) => {
    if (isRemoteUpdateError(error)) {
      console.warn("[RootLayout] remote update error ignored", {
        message: error instanceof Error ? error.message : String(error),
        isFatal: Boolean(isFatal),
      });
      return;
    }
    previousHandler?.(error, isFatal);
  });
}

if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const msg: string = event.reason?.message ?? String(event.reason ?? "");
    if (SQLITE_ERROR_PATTERNS.some((p) => msg.toLowerCase().includes(p.toLowerCase()))) {
      event.preventDefault();
    }
    if (REMOTE_UPDATE_ERROR_PATTERNS.some((p) => msg.toLowerCase().includes(p.toLowerCase()))) {
      console.warn("[RootLayout] remote update rejection ignored", { message: msg });
      event.preventDefault();
    }
  });
}

export default function RootLayout() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Platform.OS !== "web") {
        const { initDatabase } = await import("@/services/database");
        await initDatabase();
      }
      void bootstrapExpoUpdates();
      if (!cancelled) syncService.start();
    })().catch((err) => {
      console.error("[RootLayout] database init failed:", err);
      void bootstrapExpoUpdates();
      if (!cancelled) syncService.start();
    });
    return () => {
      cancelled = true;
      syncService.stop();
    };
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
    const hideFallback = setTimeout(() => {
      void SplashScreen.hideAsync().catch(() => {});
    }, 2500);

    if (fontsLoaded || fontError) {
      clearTimeout(hideFallback);
      void SplashScreen.hideAsync().catch(() => {});
    }

    return () => clearTimeout(hideFallback);
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#050B1F" }}>
        <ActivityIndicator size="large" color="#7EC8E3" />
      </View>
    );
  }

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
