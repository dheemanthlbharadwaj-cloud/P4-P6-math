// Analytics: class overview per topic (% completed, by question type), the hardest questions (filter by topic / level),
// and a per-student drill-down (topic bars + every question tried, with the question text on hover / expand).
import React, { useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import type { ClassAnalytics, Grade, StudentAnalytics } from "@p6/shared";
import { colors, fonts, space } from "../../theme/colors";
import { getQuestion, getTopics } from "../../content";
import { RichText, richToPlain } from "../../components/RichText";
import { backend } from "../client";
import { avgLabel, classTopicPct, hardestQuestions, pct, studentQuestions, typeRows } from "../helpers";
import { selectedClass, useTeacher } from "../store";
import { Badge, Bar, Muted, Notice, PageHeader, Panel, Pill, PillRow, Spinner, Table, useLoad, type RowData } from "../ui";

function QuestionPreview({ grade, id }: { grade: Grade; id: string }) {
  const q = getQuestion(grade, id);
  if (!q) return <Muted>{id} (not in this build's question bundle)</Muted>;
  return (
    <View style={{ gap: 6, maxWidth: 760 }}>
      <Text style={{ fontSize: 12, color: colors.inkSoft }}>{id}</Text>
      <RichText tokens={q.stem} size={16} />
      {q.type === "mcq" ? (q.options ?? []).map((o) => (
        <View key={o.key} style={{ flexDirection: "row", gap: 8 }}>
          <Text style={{ fontFamily: fonts.displayMedium, color: o.key === q.correctOption ? colors.good : colors.inkSoft }}>{o.key}.</Text>
          <View style={{ flex: 1 }}><RichText tokens={o.text} size={15} /></View>
        </View>
      )) : (q.parts ?? []).map((p, i) => <Muted key={i}>Answer{p.part ? ` (${p.part})` : ""}: {p.display}</Muted>)}
    </View>
  );
}

function QText({ grade, id }: { grade: Grade; id: string }) {
  const q = getQuestion(grade, id);
  const plain = q ? richToPlain(q.stem).replace(/\s+/g, " ").trim() : id;
  return <Text style={{ fontSize: 14, color: colors.ink }} numberOfLines={1} {...(Platform.OS === "web" ? ({ title: plain } as object) : {})}>{plain}</Text>;
}

function useTopicOf(grade: Grade) {
  return useMemo(() => {
    const map = new Map<string, { topicId: string; topicName: string; subName: string }>();
    try { for (const t of getTopics(grade)) for (const s of t.subtopics) map.set(s.id, { topicId: t.id, topicName: t.name, subName: s.name }); } catch { /* no bundle */ }
    return map;
  }, [grade]);
}

function Overview({ data }: { data: ClassAnalytics }) {
  const rows = data.topics.filter((t) => t.total > 0);
  return (
    <Panel title="Class overview by topic" right={<Muted>% of all map questions completed by the class</Muted>}>
      {rows.length === 0 ? <Muted>No data yet.</Muted> : rows.map((t) => {
        const types = typeRows(t);
        return (
          <View key={t.topicId} style={{ marginBottom: space.s, paddingBottom: space.s, borderBottomWidth: 1, borderBottomColor: "#f1e6dc" }}>
            <Bar label={t.title} value={classTopicPct(t) / 100} right={`${classTopicPct(t)}% · ${t.completed}/${t.total * Math.max(1, t.students)}`} labelWidth={240} />
            <View style={{ flexDirection: "row", gap: space.xl, paddingLeft: 3, flexWrap: "wrap" }}>
              {types.map((ty) => (
                <Text key={ty.type} style={{ fontSize: 13, color: colors.inkSoft }}>{ty.label}: <Text style={{ color: colors.ink, fontFamily: fonts.displayMedium }}>{ty.pct}%</Text> ({ty.completed}/{ty.total})</Text>
              ))}
              <Text style={{ fontSize: 13, color: colors.inkSoft }}>Tried by: <Text style={{ color: colors.ink, fontFamily: fonts.displayMedium }}>{pct(t.attempted, t.total * Math.max(1, t.students))}%</Text> of question slots</Text>
            </View>
          </View>
        );
      })}
    </Panel>
  );
}

function Hardest({ data, grade }: { data: ClassAnalytics; grade: Grade }) {
  const topicOf = useTopicOf(grade);
  const [topicId, setTopicId] = useState<string | undefined>();
  const [level, setLevel] = useState<number | undefined>();
  const [open, setOpen] = useState<string | null>(null);
  const topics = useMemo(() => { try { return getTopics(grade); } catch { return []; } }, [grade]);
  const rows = hardestQuestions(data.questions, { topicId, level }, (s) => topicOf.get(s)?.topicId, 20);
  const n = data.students.length;
  return (
    <Panel title="Hardest questions" right={<Muted>Most students stuck first, then most attempts per student</Muted>}>
      <PillRow style={{ marginBottom: 6 }}>
        <Pill label="All topics" selected={!topicId} onPress={() => setTopicId(undefined)} />
        {topics.map((t) => <Pill key={t.id} label={t.name} selected={topicId === t.id} onPress={() => setTopicId(t.id)} />)}
      </PillRow>
      <PillRow style={{ marginBottom: space.m }}>
        <Pill label="All levels" selected={!level} onPress={() => setLevel(undefined)} />
        {[1, 2, 3].map((l) => <Pill key={l} label={`Level ${l}`} selected={level === l} onPress={() => setLevel(l)} />)}
      </PillRow>
      <Table
        empty="No attempts match this filter."
        columns={[{ key: "q", title: "Question (click for the full text)", flex: 4 }, { key: "t", title: "Topic · level", flex: 2.4 }, { key: "a", title: "Tried", width: 70, align: "center" }, { key: "c", title: "Done", width: 70, align: "center" }, { key: "s", title: "Stuck", width: 120 }, { key: "v", title: "Avg tries", width: 84, align: "center" }]}
        rows={rows.map<RowData>((r) => {
          const info = topicOf.get(r.subtopicId);
          const stuck = r.studentsAttempted - r.studentsCompleted;
          return {
            key: r.questionId, onPress: () => setOpen(open === r.questionId ? null : r.questionId),
            cells: [
              <QText key="q" grade={grade} id={r.questionId} />,
              <View key="t"><Text style={{ fontSize: 14, color: colors.ink }} numberOfLines={1}>{info?.subName ?? r.subtopicId}</Text><Text style={{ fontSize: 12, color: colors.inkSoft }}>{info?.topicName} · LV{r.level}</Text></View>,
              String(r.studentsAttempted), `${r.studentsCompleted}`,
              <View key="s" style={{ gap: 2 }}>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: "#f1e6dc", overflow: "hidden", borderWidth: 1, borderColor: colors.border }}><View style={{ width: `${pct(stuck, Math.max(1, n))}%`, height: "100%", backgroundColor: colors.bad }} /></View>
                <Text style={{ fontSize: 11, color: colors.inkSoft }}>{stuck} of {n} students</Text>
              </View>,
              avgLabel(r.avgAttempts),
            ],
            expanded: open === r.questionId ? <QuestionPreview grade={grade} id={r.questionId} /> : undefined,
          };
        })}
      />
    </Panel>
  );
}

function Student({ uid, classId, grade }: { uid: string; classId: string; grade: Grade }) {
  const topicOf = useTopicOf(grade);
  const res = useLoad(() => backend.getAnalytics({ classId, studentUid: uid }), [classId, uid]);
  const [topicId, setTopicId] = useState<string | undefined>();
  const [open, setOpen] = useState<string | null>(null);
  const st: StudentAnalytics | undefined = res.data?.student;
  if (res.error) return <Notice kind="error" onRetry={res.reload}>{res.error}</Notice>;
  if (res.loading || !st) return <Spinner label="Loading student…" />;
  const topics = st.topics.filter((t) => t.total > 0 && t.attempted > 0);
  const rows = studentQuestions(st.questions, { topicId }, (s) => topicOf.get(s)?.topicId);
  return (
    <View>
      <Muted style={{ marginBottom: space.s }}>Progress per topic (topics not started are hidden)</Muted>
      {topics.length === 0 ? <Muted>Nothing attempted yet.</Muted> : topics.map((t) => (
        <Bar key={t.topicId} label={t.title} value={t.completed / t.total} right={`${pct(t.completed, t.total)}% · ${t.completed}/${t.total}`} labelWidth={240} color={colors.good} />
      ))}
      <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink, marginTop: space.l, marginBottom: space.s }}>Questions tried ({rows.length})</Text>
      <PillRow style={{ marginBottom: space.m }}>
        <Pill label="All topics" selected={!topicId} onPress={() => setTopicId(undefined)} />
        {topics.map((t) => <Pill key={t.topicId} label={t.title} selected={topicId === t.topicId} onPress={() => setTopicId(t.topicId)} />)}
      </PillRow>
      <Table
        empty="No questions in this topic yet."
        columns={[{ key: "q", title: "Question (click for the full text)", flex: 4 }, { key: "t", title: "Subtopic · level", flex: 2.4 }, { key: "a", title: "Attempts", width: 84, align: "center" }, { key: "w", title: "Wrong", width: 70, align: "center" }, { key: "c", title: "Completed", width: 110, align: "center" }]}
        rows={rows.slice(0, 80).map<RowData>((r) => ({
          key: r.questionId, onPress: () => setOpen(open === r.questionId ? null : r.questionId),
          cells: [
            <QText key="q" grade={grade} id={r.questionId} />,
            <Text key="t" style={{ fontSize: 14, color: colors.ink }} numberOfLines={1}>{topicOf.get(r.subtopicId)?.subName ?? r.subtopicId} · LV{r.level}</Text>,
            String(r.attempts), String(r.wrong),
            <Badge key="c" text={r.completed ? "Completed" : "Not yet"} tone={r.completed ? "green" : "pink"} />,
          ],
          expanded: open === r.questionId ? <QuestionPreview grade={grade} id={r.questionId} /> : undefined,
        }))}
      />
    </View>
  );
}

export function AnalyticsSection() {
  const cls = useTeacher(selectedClass);
  const res = useLoad(() => (cls ? backend.getAnalytics({ classId: cls.id }) : Promise.resolve(undefined)), [cls?.id]);
  const [uid, setUid] = useState<string | null>(null);
  React.useEffect(() => setUid(null), [cls?.id]);
  if (!cls) return <><PageHeader title="Analytics" /><Notice>Create a class first (Classes).</Notice></>;
  const data = res.data?.class;
  const picked = data?.students.find((s) => s.uid === uid);
  return (
    <View>
      <PageHeader title="Analytics" subtitle={`How ${cls.name} is doing on the map questions.`} />
      {res.error ? <Notice kind="error" onRetry={res.reload}>{res.error}</Notice> : null}
      {res.loading && !data ? <Spinner label="Loading analytics…" /> : null}
      {data ? (
        <>
          <Overview data={data} />
          <Hardest data={data} grade={cls.grade} />
          <Panel title="Students" right={<Muted>Click a student for the drill-down</Muted>}>
            <Table
              empty="No students in this class."
              columns={[{ key: "n", title: "Student", flex: 2 }, { key: "c", title: "Completed", width: 100, align: "center" }, { key: "a", title: "Tried", width: 80, align: "center" }, { key: "b", title: "Completed of tried", flex: 2 }]}
              rows={[...data.students].sort((a, b) => b.completed - a.completed).map((s) => ({
                key: s.uid, highlight: s.uid === uid, onPress: () => setUid(s.uid === uid ? null : s.uid),
                cells: [s.displayName, String(s.completed), String(s.attempted),
                  <View key="b" style={{ height: 12, borderRadius: 6, backgroundColor: "#f1e6dc", overflow: "hidden", borderWidth: 1, borderColor: colors.border }}><View style={{ width: `${pct(s.completed, Math.max(1, s.attempted))}%`, height: "100%", backgroundColor: colors.good }} /></View>],
              }))}
            />
          </Panel>
          {picked ? <Panel title={picked.displayName}><Student uid={picked.uid} classId={cls.id} grade={cls.grade} /></Panel> : null}
        </>
      ) : null}
    </View>
  );
}
