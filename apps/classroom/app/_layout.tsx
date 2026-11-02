// Root of the Classroom web app: fonts, the Firebase sign-in listener, the live question edits, the roles lookup.
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
import { refreshQuestionPatches } from "../src/content/patches";
import { useFigureMap } from "../src/content/figures";
import { colors } from "../src/theme/colors";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold });
  const { user, setUser } = useAuth();

  useEffect(() => {
    if (MOCK_AREAS || !isFirebaseConfigured) { setUser(null); return; }
    return watchAuth(setUser);
  }, [setUser]);

  // signed in: which areas this login has (2 reads, cached on the server) and the editor's live question edits
  useEffect(() => {
    if (MOCK_AREAS) { void useRoles.getState().load("mock"); return; }
    if (!user) { useRoles.getState().reset(); return; }
    void useRoles.getState().load(user.uid);
    void refreshQuestionPatches();
  }, [user]);
  useEffect(() => { void useFigureMap.getState().load(); }, []);

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, title: "Catapult Mathletes Classroom" }} />;
}
