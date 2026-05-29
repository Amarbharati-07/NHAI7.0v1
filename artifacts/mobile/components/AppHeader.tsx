import { MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDrawer } from "@/contexts/DrawerContext";
import { useColors } from "@/hooks/useColors";

interface AppHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export default function AppHeader({ title, showBack = false, onBack }: AppHeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { openDrawer } = useDrawer();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.header, paddingTop: topPad + 10 }]}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: colors.primary + "22" }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (showBack && onBack) onBack();
            else openDrawer();
          }}
          activeOpacity={0.7}
        >
          <MaterialIcons name={showBack ? "arrow-back" : "menu"} size={22} color={colors.accent} />
        </TouchableOpacity>

        <View style={styles.titleArea}>
          <Text style={[styles.appName, { color: colors.textMuted }]}>SPECTRA</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        </View>

        <View style={styles.rightActions}>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.primary + "22" }]}
            activeOpacity={0.7}
          >
            <MaterialIcons name="notifications" size={20} color={colors.accent} />
            <View style={[styles.badge, { backgroundColor: colors.warning }]}>
              <Text style={styles.badgeText}>2</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, { backgroundColor: colors.primary + "22" }]}
            activeOpacity={0.7}
          >
            <MaterialIcons name="account-circle" size={22} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 14, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  titleArea: { flex: 1 },
  appName: { fontSize: 9, fontWeight: "700", letterSpacing: 3 },
  title: { fontSize: 18, fontWeight: "700" },
  rightActions: { flexDirection: "row", gap: 8 },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
