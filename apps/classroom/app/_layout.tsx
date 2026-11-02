// Root of Catapult Classroom: fonts, the Firebase sign-in listener, the staff roles lookup.
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka/600SemiBold";
import { Fredoka_700Bold } from "@expo-google-fonts/fredoka/700Bold";
import { watchAuth } from "../src/services/auth";
import { isFirebaseConfigured } from "../src/services/config";
import { useAuth } from "../src/store/auth";
import { useRoles } from "../src/roles/store";
import { MOCK_AREAS } from "../src/roles/mock";
import { isParentUid } from "../src/roles/logic";
import { colors } from "../src/theme/colors";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold });
  const { user, setUser } = useAuth();

  useEffect(() => {
    if (MOCK_AREAS || !isFirebaseConfigured) { setUser(null); return; }
    return watchAuth(setUser);
  }, [setUser]);

  // staff signed in: which areas this login has (2 reads, cached on the server). Parents need neither.
  useEffect(() => {
    if (MOCK_AREAS) { void useRoles.getState().load("mock"); return; }
    if (!user || isParentUid(user.uid)) { useRoles.getState().reset(); return; }
    void useRoles.getState().load(user.uid);
  }, [user]);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, title: "Catapult Classroom" }} />;
}
