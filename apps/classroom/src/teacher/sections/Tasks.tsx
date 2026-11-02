// Worksheets & tests: create a worksheet from a level (topic → subtopic → level of the bundled curriculum) or a
// diagnostic for a topic (in the app or on paper); the list with Print, Answer key, Mark and Post answers.
import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { ClassTask, LevelNo } from "@p6/shared";
import { Button } from "../../components/ui";
import { colors, fonts, space } from "../../theme/colors";
import { getLevelIds, getTopics } from "../../content";
import { backend } from "../client";
import { defaultTaskTitle, formatDate, parseDueDate } from "../helpers";
import { openPrint } from "../printLink";
import { selectedClass, useTeacher } from "../store";
import { Badge, Field, Muted, Notice, PageHeader, Panel, Pill, PillRow, Spinner, Table, useAction, useLoad } from "../ui";

const Label = ({ children }: { children: string }) => <Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4, marginTop: space.s }}>{children}</Text>;

function Creator({ classId, grade, onCreated }: { classId: string; grade: "P4" | "P5" | "P6"; onCreated: (t: ClassTask) => void }) {
  const topics = useMemo(() => { try { return getTopics(grade); } catch { return []; } }, [grade]);
  const [kind, setKind] = useState<"worksheet" | "diagnostic">("worksheet");
  const [topicId, setTopicId] = useState<string | undefined>(topics[0]?.id);
  const [subtopicId, setSubtopicId] = useState<string | undefined>(topics[0]?.subtopics[0]?.id);
  const [level, setLevel] = useState<LevelNo>(1);
  const [inApp, setInApp] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const { busy, error, run } = useAction();
  const topic = topics.find((t) => t.id === topicId);
  const sub = topic?.subtopics.find((s) => s.id === subtopicId);
  const dueMs = due.trim() ? parseDueDate(due) : undefined;
  const levelCount = sub ? getLevelIds(grade, sub.id, level).ids.length : 0;
  const pickTopic = (id: string) => { setTopicId(id); setSubtopicId(topics.find((t) => t.id === id)?.subtopics[0]?.id); };
  const suggested = kind === "worksheet" ? defaultTaskTitle("worksheet", { subtopic: sub?.name }, level) : defaultTaskTitle("diagnostic", { topic: topic?.name });
  const invalidDue = due.trim() !== "" && dueMs === null;
  const create = () => void run(async () => {
    const t = await backend.createTask(kind === "worksheet"
      ? { classId, kind, title: title.trim() || undefined, subtopicId, level, dueAt: dueMs ?? undefined }
      : { classId, kind, title: title.trim() || undefined, topicId, inApp, dueAt: dueMs ?? undefined });
    onCreated(t); setTitle(""); setDue("");
  });
  if (topics.length === 0) return <Panel title="Create"><Notice kind="error">The question bundle for {grade} isn't in this build.</Notice></Panel>;
  return (
    <Panel title="Create a worksheet or test">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <PillRow>
        <Pill label="Worksheet (from a level)" selected={kind === "worksheet"} onPress={() => setKind("worksheet")} />
        <Pill label="Diagnostic test (for a topic)" selected={kind === "diagnostic"} onPress={() => setKind("diagnostic")} />
      </PillRow>
      <Label>Topic</Label>
      <PillRow>{topics.map((t) => <Pill key={t.id} label={t.name} selected={t.id === topicId} onPress={() => pickTopic(t.id)} />)}</PillRow>
      {kind === "worksheet" ? (
        <>
          <Label>Subtopic</Label>
          <PillRow>{(topic?.subtopics ?? []).map((s) => <Pill key={s.id} label={s.name} selected={s.id === subtopicId} onPress={() => setSubtopicId(s.id)} />)}</PillRow>
          <Label>Level</Label>
          <PillRow>{([1, 2, 3] as LevelNo[]).map((l) => <Pill key={l} label={`Level ${l}`} selected={l === level} onPress={() => setLevel(l)} />)}</PillRow>
          <Muted style={{ marginTop: space.s }}>Uses the same {levelCount} question{levelCount === 1 ? "" : "s"} the level shows in the app.</Muted>
        </>
      ) : (
        <>
          <Label>Taken</Label>
          <PillRow>
            <Pill label="On paper (you mark it)" selected={!inApp} onPress={() => setInApp(false)} />
            <Pill label="In the app (marked automatically)" selected={inApp} onPress={() => setInApp(true)} />
          </PillRow>
          <Muted style={{ marginTop: space.s }}>One question from each subtopic of the topic, mixed Level 1 to 3, at most 12.</Muted>
        </>
      )}
      <View style={{ flexDirection: "row", gap: space.m, flexWrap: "wrap", marginTop: space.m }}>
        <Field label="Title (optional)" placeholder={suggested} value={title} onChangeText={setTitle} style={{ width: 380, marginBottom: 0 }} />
        <Field label="Due date (optional)" placeholder="YYYY-MM-DD" value={due} onChangeText={setDue} maxLength={10} hint={invalidDue ? "Use YYYY-MM-DD" : undefined} style={{ width: 170, marginBottom: 0 }} />
      </View>
      <View style={{ marginTop: space.l, flexDirection: "row" }}>
        <Button title={busy ? "Creating…" : kind === "worksheet" ? "Create worksheet" : "Create test"} onPress={create}
          disabled={busy || invalidDue || (kind === "worksheet" ? !subtopicId : !topicId)} />
      </View>
    </Panel>
  );
}

function basedOn(t: ClassTask): string {
  try {
    if (t.kind === "worksheet") {
      for (const top of getTopics(t.grade)) { const s = top.subtopics.find((x) => x.id === t.subtopicId); if (s) return `${s.name} · Level ${t.level ?? "?"}`; }
    } else {
      return getTopics(t.grade).find((x) => x.id === t.topicId)?.name ?? "";
    }
  } catch { /* no bundle */ }
  return "";
}

export function TasksSection() {
  const cls = useTeacher(selectedClass);
  const go = useTeacher((s) => s.go);
  const tasks = useLoad(() => (cls ? backend.listTasks(cls.id) : Promise.resolve([])), [cls?.id]);
  if (!cls) return <><PageHeader title="Worksheets & tests" /><Notice>Create a class first (Classes).</Notice></>;
  const list = [...(tasks.data ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const btn = (title: string, onPress: () => void) => <Button key={title} title={title} small variant="ghost" onPress={onPress} style={{ paddingHorizontal: 10 }} />;
  return (
    <View>
      <PageHeader title="Worksheets & tests" subtitle={`For ${cls.name}. Print worksheets, then mark the paper work in Marking.`} />
      <Creator classId={cls.id} grade={cls.grade} onCreated={(t) => tasks.set([t, ...(tasks.data ?? [])])} />
      <Panel title="Created for this class">
        {tasks.error ? <Notice kind="error" onRetry={tasks.reload}>{tasks.error}</Notice> : null}
        {tasks.loading && !tasks.data ? <Spinner /> : (
          <Table
            empty="Nothing yet. Create a worksheet or a test above."
            columns={[{ key: "t", title: "Title", flex: 2.6 }, { key: "b", title: "Based on", flex: 2 }, { key: "q", title: "Qs", width: 44, align: "center" }, { key: "d", title: "Created", width: 108 }, { key: "u", title: "Due", width: 108 }, { key: "a", title: "", flex: 4.2, align: "right" }]}
            rows={list.map((t) => ({
              key: t.id,
              cells: [
                <View key="t" style={{ gap: 3 }}>
                  <Text style={{ fontSize: 15, color: colors.ink }}>{t.title}</Text>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    <Badge text={t.kind === "worksheet" ? "Worksheet" : "Diagnostic"} tone={t.kind === "worksheet" ? "blue" : "gold"} />
                    <Badge text={t.inApp ? "In the app" : "On paper"} tone="grey" />
                  </View>
                </View>,
                basedOn(t), String(t.questionIds.length), formatDate(t.createdAt), t.dueAt ? formatDate(t.dueAt) : "-",
                <View key="a" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                  {btn("Print", () => openPrint(cls.id, t.id))}
                  {btn("Answer key", () => openPrint(cls.id, t.id, true))}
                  {btn("Mark", () => go("marking", { markTaskId: t.id }))}
                  {btn("Post answers", () => go("posts", { postTaskId: t.id }))}
                </View>,
              ],
            }))}
          />
        )}
      </Panel>
    </View>
  );
}
