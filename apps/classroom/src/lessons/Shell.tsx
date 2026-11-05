// Teacher frame (teachers and admins alike): side navigation (Lessons · Students · Worksheet builder · Teachers for admins only).
// Under 900 px the navigation becomes a bar across the top (tablets, phones).
import React from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { colors, fonts, radius, space } from "../theme/colors";
import { signOut } from "../services/auth";
import { Button } from "../components/ui";
import { useAuth } from "../store/auth";
import { MOCK_AREAS } from "../roles/mock";
import { useRoles } from "../roles/store";
import { useAdmin } from "../admin/store";
import { SECTIONS, useTeacher, type Section } from "./store";

export function Shell({ children, active }: { children: React.ReactNode; active?: Section }) {
  const { width } = useWindowDimensions();
  const narrow = width < 900;
  const { section, go } = useTeacher();
  const router = useRouter();
  const path = usePathname();
  const open = (s: Section) => { go(s); if (path !== "/teacher") router.replace("/teacher"); };
  const user = useAuth((s) => s.user);
  const isAdmin = useRoles((s) => s.roles.admin) || MOCK_AREAS;
  const adminName = useAdmin((s) => s.admin?.name);
  const myName = user?.displayName || adminName || "";
  const current = active ?? section;
  const nav = (
    <View style={narrow ? { flexDirection: "row", flexWrap: "wrap", gap: 6 } : { gap: 6 }}>
      {SECTIONS.filter((s) => s.id !== "teachers" || isAdmin).map((s) => {
        const on = s.id === current;
        return (
          <Pressable key={s.id} onPress={() => open(s.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={({ pressed }) => [{ paddingVertical: narrow ? 8 : 11, paddingHorizontal: 14, borderRadius: radius.s, borderWidth: 2, borderColor: on ? colors.border : "transparent", backgroundColor: on ? colors.primary : "transparent" }, pressed && { opacity: 0.8 }]}>
            <Text style={{ fontSize: 16, fontFamily: fonts.displayMedium, color: on ? "#fff" : colors.ink }}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const signOutBtn = MOCK_AREAS ? <Text style={{ fontSize: 12, color: colors.bad, fontFamily: fonts.displayMedium }}>Demo data (mock mode)</Text> : <Button title="Sign out" small variant="ghost" onPress={() => { void signOut(); }} />;
  return (
    <View style={{ flex: 1, flexDirection: narrow ? "column" : "row", backgroundColor: colors.bg }}>
      <View style={narrow ? { padding: space.m, borderBottomWidth: 3, borderColor: colors.border, backgroundColor: colors.card, gap: space.s } : { width: 244, padding: space.l, gap: space.m, borderRightWidth: 3, borderColor: colors.border, backgroundColor: colors.card }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.s }}>
          <View>
            <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink }}>Catapult Classroom</Text>
            <Text style={{ fontSize: 13, color: colors.inkSoft }}>Teacher</Text>
          </View>
          {narrow ? signOutBtn : null}
        </View>
        {nav}
        {narrow ? null : (
          <View style={{ marginTop: "auto", gap: 6 }}>
            {myName ? <Text style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>{myName}</Text> : null}
            {signOutBtn}
          </View>
        )}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: narrow ? space.l : space.xl, paddingBottom: 64, maxWidth: 1240, width: "100%" }}>
        {children}
      </ScrollView>
    </View>
  );
}
