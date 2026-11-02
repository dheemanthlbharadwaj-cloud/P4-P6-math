// Lessons: the shared library (every teacher can use every lesson). New / edit a lesson (title, subject, level, intro line,
// learning goals with a prepared sentence for :) :| :(, and the parts a lesson has), archive it, or run it.
import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { FACES, SUBJECTS, type Face, type LearningGoal, type Lesson, type LessonPart, type Subject } from "@p6/shared";
import { Button } from "../../components/ui";
import { ConfirmButton, Field, Muted, Notice, PageHeader, Panel, Pill, PillRow, Table, useAction } from "../../components/dash";
import { colors, fonts, space } from "../../theme/colors";
import { backend } from "../client";
import { useTeacher } from "../store";

type Draft = { id?: string; title: string; subject: Subject; level: string; intro: string; goals: LearningGoal[]; parts: LessonPart[] };
const blankGoal = (): LearningGoal => ({ id: "", text: "", scripts: { good: "", ok: "", bad: "" } });
const empty = (): Draft => ({ title: "", subject: "math", level: "P5", intro: "Today, {names} worked on {lesson}.", goals: [blankGoal()], parts: [{ id: "", title: "" }] });
const subjectLabel = (s: Subject) => SUBJECTS.find((x) => x.id === s)?.label ?? s;

function Editor({ start, onDone }: { start: Draft; onDone: (l?: Lesson) => void }) {
  const [d, setD] = useState<Draft>(start);
  const { busy, error, run } = useAction();
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setGoal = (i: number, g: Partial<LearningGoal>) => set({ goals: d.goals.map((x, j) => (j === i ? { ...x, ...g } : x)) });
  const setScript = (i: number, f: Face, v: string) => setGoal(i, { scripts: { ...d.goals[i].scripts, [f]: v } });
  const setPart = (i: number, title: string) => set({ parts: d.parts.map((x, j) => (j === i ? { ...x, title } : x)) });
  const save = () => void run(async () => {
    const { lesson } = await backend.saveLesson({ ...(d.id ? { id: d.id } : {}), title: d.title, subject: d.subject, level: d.level, intro: d.intro,
      goals: d.goals.map((g) => ({ ...g, id: g.id })), parts: d.parts });
    onDone(lesson);
  });
  return (
    <Panel title={d.id ? `Edit: ${start.title}` : "New lesson"}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.m }}>
        <Field label="Title" value={d.title} onChangeText={(title) => set({ title })} placeholder="e.g. Science end-year paper practice" style={{ flexGrow: 1, minWidth: 260 }} />
        <Field label="Level" value={d.level} onChangeText={(level) => set({ level })} placeholder="P5" style={{ width: 110 }} />
      </View>
      <Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4 }}>Subject</Text>
      <PillRow style={{ marginBottom: space.m }}>{SUBJECTS.map((s) => <Pill key={s.id} label={s.label} selected={d.subject === s.id} onPress={() => set({ subject: s.id })} />)}</PillRow>
      <Field label="Opening line of the feedback" value={d.intro} onChangeText={(intro) => set({ intro })} multiline hint="{names} becomes the children's first names (Zimo and Ziqiao), {lesson} the lesson title." />

      <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink, marginTop: space.s }}>Learning goals</Text>
      <Muted style={{ marginBottom: space.s }}>For each goal, write the sentence to use for each face. {"{name}"} becomes the child's first name.</Muted>
      {d.goals.map((g, i) => (
        <View key={i} style={{ borderWidth: 2, borderColor: "#eadfd3", borderRadius: 12, padding: space.m, marginBottom: space.m }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m }}>
            <Field label={`Goal ${i + 1}`} value={g.text} onChangeText={(text) => setGoal(i, { text })} placeholder="e.g. Uses keywords in answers" style={{ flex: 1 }} />
            <Button title="Remove" small variant="ghost" onPress={() => set({ goals: d.goals.filter((_, j) => j !== i) })} style={{ marginBottom: space.m }} />
          </View>
          {FACES.map((f) => (
            <Field key={f.id} label={`${f.emoji}  ${f.label}`} value={g.scripts[f.id]} onChangeText={(v) => setScript(i, f.id, v)} placeholder={f.id === "good" ? "{name} used keywords well." : ""} />
          ))}
        </View>
      ))}
      <Button title="Add a learning goal" small variant="ghost" onPress={() => set({ goals: [...d.goals, blankGoal()] })} style={{ alignSelf: "flex-start", marginBottom: space.l }} />

      <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink }}>Parts of the lesson</Text>
      <Muted style={{ marginBottom: space.s }}>When you run the lesson you tick which parts each child finished. Only teachers see this.</Muted>
      {d.parts.map((p, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m }}>
          <Field label={`Part ${i + 1}`} value={p.title} onChangeText={(t) => setPart(i, t)} placeholder="e.g. MCQ section" style={{ flex: 1 }} />
          <Button title="Remove" small variant="ghost" onPress={() => set({ parts: d.parts.filter((_, j) => j !== i) })} style={{ marginBottom: space.m }} />
        </View>
      ))}
      <Button title="Add a part" small variant="ghost" onPress={() => set({ parts: [...d.parts, { id: "", title: "" }] })} style={{ alignSelf: "flex-start", marginBottom: space.l }} />

      <View style={{ flexDirection: "row", gap: space.m }}>
        <Button title={busy ? "Saving…" : "Save lesson"} onPress={save} disabled={busy || !d.title.trim()} />
        <Button title="Cancel" variant="ghost" onPress={() => onDone()} />
      </View>
    </Panel>
  );
}

export function LessonsSection() {
  const router = useRouter();
  const { lessons, upsertLesson, removeLesson } = useTeacher();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [subject, setSubject] = useState<Subject | "all">("all");
  const { error, run } = useAction();
  const shown = lessons.filter((l) => subject === "all" || l.subject === subject);
  if (editing) return <Editor start={editing} onDone={(l) => { if (l) upsertLesson(l); setEditing(null); }} />;
  return (
    <View>
      <PageHeader title="Lessons" subtitle="Prepared lessons. Run one after class to record each child's progress and make the parents' feedback."
        right={<Button title="New lesson" onPress={() => setEditing(empty())} />} />
      {error ? <Notice kind="error">{error}</Notice> : null}
      <PillRow style={{ marginBottom: space.m }}>
        <Pill label="All" selected={subject === "all"} onPress={() => setSubject("all")} />
        {SUBJECTS.map((s) => <Pill key={s.id} label={s.label} selected={subject === s.id} onPress={() => setSubject(s.id)} />)}
      </PillRow>
      <Table
        columns={[{ key: "t", title: "Lesson", flex: 3 }, { key: "s", title: "Subject", width: 90 }, { key: "l", title: "Level", width: 70 }, { key: "g", title: "Goals", width: 60, align: "center" }, { key: "a", title: "", width: 300 }]}
        empty="No lessons yet. Make one with New lesson."
        rows={shown.map((l) => ({
          key: l.id,
          cells: [l.title, subjectLabel(l.subject), l.level, String(l.goals.length),
            <View key="a" style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button title="Run lesson" small onPress={() => router.push(`/teacher/run/${l.id}`)} />
              <Button title="Edit" small variant="ghost" onPress={() => setEditing({ id: l.id, title: l.title, subject: l.subject, level: l.level, intro: l.intro, goals: l.goals, parts: l.parts })} />
              <ConfirmButton title="Archive" confirmTitle="Sure? Archive" onConfirm={() => void run(async () => { await backend.deleteLesson(l.id); removeLesson(l.id); })} />
            </View>],
        }))}
      />
      <Muted style={{ marginTop: space.s }}>Archived lessons disappear from this list; children's past reports keep them.</Muted>
    </View>
  );
}
