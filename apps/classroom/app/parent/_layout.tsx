// /parent: a family-code login only. Teachers who land here are sent to their own area.
import React from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import { Redirect, Slot } from "expo-router";
import { Centered, SignIn } from "../../src/components/SignIn";
import { useAuth } from "../../src/store/auth";
import { MOCK_MODE } from "../../src/roles/mock";
import { isParentUid } from "../../src/roles/logic";
import { colors } from "../../src/theme/colors";

export default function ParentLayout() {
  const { user, ready } = useAuth();
  if (MOCK_MODE === "parent") return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}><Slot /></ScrollView>;
  if (MOCK_MODE === "staff") return <Redirect href="/teacher" />;
  if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
  if (!user) return <SignIn />;
  if (!isParentUid(user.uid)) return <Redirect href="/teacher" />;
  return <ScrollView style={{ flex: 1, backgroundColor: colors.bg }}><Slot /></ScrollView>;
}
