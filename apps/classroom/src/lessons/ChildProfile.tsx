// A child's profile (teachers): every lesson report, newest first, with the face for each learning goal, the parts finished
// (teachers only) and the note, plus totals. Worksheet results and exam analysis join this page later.
import React from "react";
import { Text, View } from "react-native";
import type { Lesson } from "@p6/shared";
import { Button } from "../components/ui";
import { Badge, Muted, Notice, PageHeader, Panel, Spinner, useLoad } from "../components/dash";
import { colors, fonts, space } from "../theme/colors";
import { backend } from "./client";
import { useTeacher } from "./store";
import { childSummary, faceEmoji, faceLabel, formatDay } from "./format";

export function ChildProfile({ childId, onBack }: { childId: string; onBack: () => void }) {
  const lessons = useTeacher((s) => s.lessons);
  const r = useLoad(() => backend.getChild(childId), [childId]);
  if (r.error) return <View><Notice kind="error" onRetry={r.reload}>{r.error}</Notice><Button title="Back" variant="ghost" onPress={onBack} /></View>;
  if (!r.data) return <Spinner label="Loading the profile…" />;
  const { child, family, reports } = r.data;
  const sum = childSummary(reports);
  const lessonOf = (id: string): Lesson | undefined => lessons.find((l) => l.id === id);
  return (
    <View>
      <PageHeader title={child.name} subtitle={`${child.level} · parent: ${family.parentName}`} right={<Button title="Back to students" small variant="ghost" onPress={onBack} />} />
      <Panel title="Overview">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xl }}>
          {[["Lessons done", String(sum.lessons)], [":) Got it", String(sum.faces.good)], [":| Getting there", String(sum.faces.ok)], [":( Needs help", String(sum.faces.bad)]].map(([k, v]) => (
            <View key={k}><Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink }}>{v}</Text><Muted>{k}</Muted></View>
          ))}
        </View>
      </Panel>
      {reports.length === 0 ? <Panel><Muted>No lessons yet. Run a lesson from Lessons and pick {child.name.split(" ")[0]}.</Muted></Panel> : null}
      {reports.map((rep) => {
        const lesson = lessonOf(rep.lessonId);
        const goals = lesson?.goals ?? Object.keys(rep.goals).map((id) => ({ id, text: "(goal of an archived lesson)" }));
        return (
          <Panel key={rep.id} title={rep.lessonTitle} right={<Badge text={formatDay(rep.date)} tone="grey" />}>
            {goals.map((g) => (
              <View key={g.id} style={{ flexDirection: "row", gap: space.m, marginBottom: 4 }}>
                <Text style={{ width: 36, fontSize: 16, fontFamily: fonts.display, color: colors.ink }} accessibilityLabel={faceLabel(rep.goals[g.id])}>{faceEmoji(rep.goals[g.id])}</Text>
                <Text style={{ flex: 1, fontSize: 15, color: colors.ink }}>{g.text}</Text>
              </View>
            ))}
            {lesson?.parts.length ? (
              <Muted style={{ marginTop: space.s }}>Parts finished (teachers only): {rep.partsDone.length} of {lesson.parts.length}{rep.partsDone.length ? ` · ${lesson.parts.filter((p) => rep.partsDone.includes(p.id)).map((p) => p.title).join(", ")}` : ""}</Muted>
            ) : null}
            {rep.note ? <Text style={{ marginTop: space.s, fontSize: 15, color: colors.ink }}>Note: {rep.note}</Text> : null}
          </Panel>
        );
      })}
    </View>
  );
}
