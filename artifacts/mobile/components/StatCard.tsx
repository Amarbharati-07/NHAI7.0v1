import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  bg?: string;
  subtitle?: string;
}

export default function StatCard({ label, value, icon, color, bg, subtitle }: StatCardProps) {
  const colors = useColors();
  const iconColor = color ?? colors.accent;
  const iconBg = bg ?? colors.primary + "22";

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.radius }]}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: iconColor }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    padding: 16,
    borderWidth: 1,
    gap: 6,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  value: { fontSize: 26, fontWeight: "700" },
  label: { fontSize: 12, fontWeight: "500" },
  subtitle: { fontSize: 11, fontWeight: "600" },
});
