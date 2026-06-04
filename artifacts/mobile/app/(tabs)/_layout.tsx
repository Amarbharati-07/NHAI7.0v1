import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  const colors = useColors();
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10, color: colors.textSecondary, fontWeight: "600" }}>Preparing dashboard…</Text>
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/dashboard" />;
}
