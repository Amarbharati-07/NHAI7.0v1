import { Redirect } from "expo-router";
import React from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function TabsLayout() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/dashboard" />;
}
