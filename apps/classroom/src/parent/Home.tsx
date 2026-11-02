// The parent's page: every child of the family (one code), and the lessons each child has completed, newest first, with
// the lesson's learning goals and the teacher's message. Never the teacher panel, never which parts were finished.
// Questions and answers of the lesson worksheets join each lesson when worksheets exist.
import React, { useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { SUBJECTS, joinNames, type ParentHome } from "@p6/shared";
import { Button } from "../components/ui";
import { Badge, Muted, Notice, Panel, Pill, PillRow, Spinner, useLoad } from "../components/dash";
import { colors, fonts, space } from "../theme/colors";
import { signOut } from "../services/auth";
import { MOCK_AREAS } from "../roles/mock";
import { backend } from "../lessons/client";
import { bySession, formatDay } from "../lessons/format";

export function ParentHomeView() {
  const r = useLoad<ParentHome>(() => backend.parentGetHome(), []);
  const [childId, setChildId] = useState<string | "all">("all");
  const narrow = useWindowDimensions().width < 600;
  const top = (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, backgroundColor: colors.card, borderBottomWidth: 3, borderColor: colors.border }}>
      <View style={{ flexGrow: 1 }}>
        <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink }}>Catapult Classroom</Text>
        <Text style={{ fontSize: 13, color: colors.inkSoft }}>{r.data ? r.data.family.parentName : ""}{MOCK_AREAS ? " · demo data" : ""}</Text>
      </View>
      {MOCK_AREAS ? null : <Button title="Sign out" small variant="ghost" onPress={() => { void signOut(); }} />}
    </View>
  );
  let body: React.ReactNode;
  if (r.error) body = <Notice kind="error" onRetry={r.reload}>{r.error}</Notice>;
  else if (!r.data) body = <Spinner label="Loading…" />;
  else {
    const h = r.data;
    const name = (id: string) => h.children.find((c) => c.id === id)?.name ?? "";
    const rows = h.reports.filter((x) => childId === "all" || x.childId === childId);
    const sessions = bySession(rows);
    body = (
      <>
        {h.children.length > 1 ? (
          <PillRow style={{ marginBottom: space.l }}>
            <Pill label="All children" selected={childId === "all"} onPress={() => setChildId("all")} />
            {h.children.map((c) => <Pill key={c.id} label={c.name} selected={childId === c.id} onPress={() => setChildId(c.id)} />)}
          </PillRow>
        ) : null}
        <Text accessibilityRole="header" style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink, marginBottom: space.m }}>Lessons</Text>
        {sessions.length === 0 ? <Panel><Muted>No completed lessons yet. They appear here after each lesson.</Muted></Panel> : null}
        {sessions.map((s) => {
          const lesson = h.lessons.find((l) => l.id === s.rows[0].lessonId);
          const subject = SUBJECTS.find((x) => x.id === lesson?.subject)?.label;
          return (
            <Panel key={s.sessionId} title={s.rows[0].lessonTitle} right={<View style={{ flexDirection: "row", gap: 6 }}>{subject ? <Badge text={subject} tone="blue" /> : null}<Badge text={formatDay(s.date)} tone="grey" /></View>}>
              <Muted style={{ marginBottom: space.s }}>Completed by {joinNames(s.rows.map((x) => name(x.childId)))}</Muted>
              {lesson?.goals.length ? (
                <View style={{ marginBottom: space.m }}>
                  <Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4 }}>Learning goals</Text>
                  {lesson.goals.map((g) => <Text key={g.id} style={{ fontSize: 15, color: colors.ink, marginBottom: 2 }}>• {g.text}</Text>)}
                </View>
              ) : null}
              {h.feedback[s.sessionId] ? (
                <View style={{ backgroundColor: colors.highlight, borderRadius: 12, padding: space.m, marginBottom: space.m }}>
                  <Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4 }}>From the teacher</Text>
                  <Text selectable style={{ fontSize: 15, color: colors.ink, lineHeight: 22 }}>{h.feedback[s.sessionId]}</Text>
                </View>
              ) : null}
              <Muted>Questions and answers: {narrow ? "" : "the worksheet questions your child answered, with the answers, "}appear here once this lesson has a worksheet.</Muted>
            </Panel>
          );
        })}
      </>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {top}
      <View style={{ flex: 1 }}>
        <View style={{ padding: space.l, width: "100%", maxWidth: 860, alignSelf: "center" }}>{body}</View>
      </View>
    </View>
  );
}
