// /student: every signed-in login (the game's student accounts; teachers and the owner can look too).
import React from "react";
import { ActivityIndicator } from "react-native";
import { Slot } from "expo-router";
import { Centered, SignIn } from "../../src/components/SignIn";
import { useAuth } from "../../src/store/auth";
import { MOCK_AREAS } from "../../src/roles/mock";
import { colors } from "../../src/theme/colors";

export default function StudentLayout() {
  const { user, ready } = useAuth();
  if (!MOCK_AREAS) {
    if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
    if (!user) return <SignIn />;
  }
  return <Slot />;
}
