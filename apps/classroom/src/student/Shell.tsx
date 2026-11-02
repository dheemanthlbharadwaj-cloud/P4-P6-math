// Student area frame: a top bar (name, area switch, sign out) over a centred page. Works from phones to desktops.
import React from "react";
import { Linking, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Button } from "../components/ui";
import { AreaSwitcher } from "../components/AreaSwitcher";
import { signOut } from "../services/auth";
import { extra } from "../services/config";
import { useAuth } from "../store/auth";
import { MOCK_AREAS } from "../roles/mock";
import { colors, fonts, space } from "../theme/colors";

export function StudentTopBar() {
  const user = useAuth((s) => s.user);
  const narrow = useWindowDimensions().width < 600;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, backgroundColor: colors.card, borderBottomWidth: 3, borderColor: colors.border }}>
      <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 160 }}>
        <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink }}>Catapult Mathletes</Text>
        <Text style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>Classroom{user?.email && !narrow ? ` · ${user.email}` : ""}{MOCK_AREAS ? " · demo data" : ""}</Text>
      </View>
      <AreaSwitcher current="student" />
      <View style={{ flexDirection: "row", gap: space.s }}>
        <Button title="Play the game" small variant="gold" onPress={() => void Linking.openURL(extra.gameUrl)} />
        {MOCK_AREAS ? null : <Button title="Sign out" small variant="ghost" onPress={() => { void signOut(); }} />}
      </View>
    </View>
  );
}

export function StudentPage({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StudentTopBar />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.l, paddingBottom: 64, width: "100%", maxWidth: 1180, alignSelf: "center" }}>
        {children}
      </ScrollView>
    </View>
  );
}
