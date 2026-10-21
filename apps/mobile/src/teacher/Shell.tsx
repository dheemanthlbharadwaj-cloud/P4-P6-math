// Dashboard frame: side navigation (Classes · Posts · Worksheets & tests · Marking · Analytics), the class picker, the
// signed-in teacher. Desktop first; under 900 px the navigation becomes a bar across the top (tablets).
import React from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { colors, fonts, radius, space } from "../theme/colors";
import { signOut } from "../services/auth";
import { Button } from "../components/ui";
import { TEACHER_MOCK } from "./client";
import { SECTIONS, selectedClass, useTeacher, type Section } from "./store";
import { Muted, Pill, PillRow } from "./ui";

export function Shell({ children }: { children: (section: Section) => React.ReactNode }) {
  const { width } = useWindowDimensions();
  const narrow = width < 900;
  const { teacher, classes, classId, section, go, selectClass } = useTeacher();
  const cls = useTeacher(selectedClass);

  const nav = (
    <View style={narrow ? { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" } : { gap: 6 }}>
      {SECTIONS.map((s) => {
        const on = s.id === section;
        return (
          <Pressable key={s.id} onPress={() => go(s.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={({ pressed }) => [{ paddingVertical: 11, paddingHorizontal: 14, borderRadius: radius.s, borderWidth: 2, borderColor: on ? colors.border : "transparent", backgroundColor: on ? colors.primary : "transparent" }, pressed && { opacity: 0.8 }]}>
            <Text style={{ fontSize: 16, fontFamily: fonts.displayMedium, color: on ? "#fff" : colors.ink }}>{s.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, flexDirection: narrow ? "column" : "row", backgroundColor: colors.bg }}>
      <View style={narrow ? { padding: space.m, borderBottomWidth: 3, borderColor: colors.border, backgroundColor: colors.card, gap: space.s } : { width: 244, padding: space.l, borderRightWidth: 3, borderColor: colors.border, backgroundColor: colors.card }}>
        <View style={narrow ? { flexDirection: "row", alignItems: "center", justifyContent: "space-between" } : { marginBottom: space.l }}>
          <View>
            <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink }}>Catapult Math Athletes</Text>
            <Text style={{ fontSize: 13, color: colors.inkSoft }}>Teacher dashboard</Text>
          </View>
          {narrow ? <Button title="Sign out" small variant="ghost" onPress={() => { void signOut(); }} disabled={TEACHER_MOCK} /> : null}
        </View>
        {nav}
        {narrow ? null : (
          <View style={{ marginTop: "auto", paddingTop: space.l, gap: 6 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.displayMedium, color: colors.ink }}>{teacher?.name}</Text>
            <Text style={{ fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>{teacher?.email}</Text>
            {TEACHER_MOCK ? <Text style={{ fontSize: 12, color: colors.bad, fontFamily: fonts.displayMedium }}>Demo data (mock mode)</Text> : <Button title="Sign out" small variant="ghost" onPress={() => { void signOut(); }} />}
          </View>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {section !== "classes" || classes.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.s, paddingHorizontal: space.xl, paddingVertical: space.s, borderBottomWidth: 2, borderColor: "#eadfd3", backgroundColor: "#fffdf8" }}>
            <Muted style={{ marginRight: 4 }}>Class</Muted>
            {classes.length === 0 ? <Muted>None yet</Muted> : (
              <PillRow>{classes.map((c) => <Pill key={c.id} label={c.name} selected={c.id === classId} onPress={() => selectClass(c.id)} />)}</PillRow>
            )}
            {cls ? <Muted style={{ marginLeft: "auto" }}>{cls.grade} · {cls.students.length} student{cls.students.length === 1 ? "" : "s"}</Muted> : null}
          </View>
        ) : null}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: narrow ? space.l : space.xl, paddingBottom: 64, maxWidth: 1240, width: "100%" }}>
          {children(section)}
        </ScrollView>
      </View>
    </View>
  );
}
