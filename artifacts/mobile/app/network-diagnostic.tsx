import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const TARGET_URL = "http://192.168.1.109:3000/api/health";

export default function NetworkDiagnosticScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [running, setRunning] = useState(false);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorStack, setErrorStack] = useState("");
  const targetUrl = TARGET_URL;

  const runTest = async () => {
    setRunning(true);
    setSuccess(null);
    setStatus(null);
    setBody("");
    setErrorMessage("");
    setErrorStack("");

    console.info("[NETDIAG] URL:", targetUrl);
    try {
      const response = await fetch(targetUrl);
      const responseBody = await response.text();
      console.info("[NETDIAG] Status:", response.status);
      console.info("[NETDIAG] Body:", responseBody || "(empty)");
      setSuccess(response.ok);
      setStatus(response.status);
      setBody(responseBody || "(empty)");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack ?? "" : "";
      console.info("[NETDIAG] Exception:", message);
      console.info("[NETDIAG] Stack:", stack || "(empty)");
      setSuccess(false);
      setErrorMessage(message);
      setErrorStack(stack || "(empty)");
    } finally {
      setRunning(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Network Diagnostic</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Direct fetch test with no API wrapper, cache, or offline fallback.
      </Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Row label="Target URL" value={targetUrl} colors={colors} />
        <Row
          label="Result"
          value={success === null ? "Not run" : success ? "Success" : "Failure"}
          colors={colors}
        />
        <Row label="HTTP Status" value={status === null ? "—" : String(status)} colors={colors} />
        <Row
          label="Response Body"
          value={body || "—"}
          colors={colors}
          multiline
        />
        <Row
          label="Exception"
          value={errorMessage || "—"}
          colors={colors}
          multiline
        />
        <Row
          label="Stack"
          value={errorStack || "—"}
          colors={colors}
          multiline
        />
      </View>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={runTest}
        disabled={running}
      >
        {running ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Run Fetch Test</Text>}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryButton, { borderColor: colors.border }]}
        onPress={() => router.back()}
      >
        <Text style={[styles.secondaryText, { color: colors.textSecondary }]}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  colors,
  multiline = false,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  multiline?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.foreground }]} numberOfLines={multiline ? undefined : 1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: "800", marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 20,
  },
  row: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  value: { fontSize: 14, lineHeight: 20 },
  button: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  secondaryText: { fontSize: 15, fontWeight: "600" },
});
