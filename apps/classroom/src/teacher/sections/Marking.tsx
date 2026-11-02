// Marking: a grid of students × questions of one task. Tap a cell (or Space / Enter) to cycle empty → ✓ → ✗ → empty;
// keys 1 / y = right, 2 / n = wrong, 0 / Backspace = clear; arrow keys move. Saved per student with teacherMarkTask
// (right = the question's star once ever, wrong = Unlimited Mistakes), which says how many stars it awarded.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { ClassDoc, ClassTask, TaskMarks } from "@p6/shared";
import { Button } from "../../components/ui";
import { colors, fonts, space } from "../../theme/colors";
import { getQuestion } from "../../content";
import { richToPlain } from "../../components/RichText";
import { backend, friendlyError } from "../client";
import { columnSummary, cycleMark, gridFromMarks, keyToMark, markSummary, marksPayload, moveCell, sameMarks, setCell, setRow, sortRoster, type Grid } from "../helpers";
import { selectedClass, useTeacher } from "../store";
import { Badge, Muted, Notice, PageHeader, Panel, Pill, PillRow, Spinner, useLoad } from "../ui";

const CELL = 46;

function Cell({ value, onToggle, onKey, label, innerRef }: { value?: "right" | "wrong"; onToggle: () => void; onKey: (e: { key: string; preventDefault: () => void }) => void; label: string; innerRef: (el: unknown) => void }) {
  const right = value === "right", wrong = value === "wrong";
  const webKeys = Platform.OS === "web" ? ({ onKeyDown: onKey } as object) : {};
  return (
    <Pressable
      ref={innerRef as never} onPress={onToggle} {...webKeys} accessibilityRole="checkbox" accessibilityLabel={label}
      aria-checked={right ? true : wrong ? false : "mixed"}
      style={({ pressed }) => [{ width: CELL, height: CELL - 6, marginHorizontal: 3, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center",
        borderColor: right ? colors.good : wrong ? colors.bad : "#d9cfc6", backgroundColor: right ? colors.goodBg : wrong ? colors.badBg : "#fff" }, pressed && { opacity: 0.7 }]}
    >
      <Text style={{ fontSize: 20, fontFamily: fonts.display, color: right ? colors.good : wrong ? colors.bad : "#d9cfc6" }}>{right ? "✓" : wrong ? "✗" : "·"}</Text>
    </Pressable>
  );
}

function MarkGrid({ cls, task, saved }: { cls: ClassDoc; task: ClassTask; saved: TaskMarks[] }) {
  const qids = task.questionIds;
  const students = useMemo(() => sortRoster(cls.students), [cls.students]);
  const [base, setBase] = useState<Grid>(() => gridFromMarks(saved, qids));
  const [grid, setGrid] = useState<Grid>(base);
  const [stars, setStars] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const cells = useRef(new Map<string, { focus?: () => void }>());
  const sources = useMemo(() => new Map(saved.map((m) => [m.studentUid, m.source])), [saved]);

  const titles = qids.map((id) => { const q = getQuestion(task.grade, id); return q ? richToPlain(q.stem).replace(/\s+/g, " ").slice(0, 160) : id; });
  const dirty = (uid: string) => !sameMarks(grid[uid], base[uid], qids);
  const dirtyUids = students.map((s) => s.uid).filter(dirty);

  const save = async (uid: string) => {
    setSaving((s) => ({ ...s, [uid]: true })); setErrors((e) => { const n = { ...e }; delete n[uid]; return n; });
    try {
      const marks = marksPayload(grid[uid], qids);
      const r = await backend.markTask({ classId: cls.id, taskId: task.id, studentUid: uid, marks });
      setBase((b) => ({ ...b, [uid]: marks }));
      setStars((s) => ({ ...s, [uid]: (s[uid] ?? 0) + r.starsAwarded }));
    } catch (e) {
      setErrors((x) => ({ ...x, [uid]: friendlyError(e) }));
    } finally {
      setSaving((s) => ({ ...s, [uid]: false }));
    }
  };
  const saveAll = async () => { for (const u of dirtyUids) await save(u); };

  const focusCell = (r: number, c: number) => cells.current.get(`${r},${c}`)?.focus?.();
  const onKey = (r: number, c: number) => (e: { key: string; preventDefault: () => void }) => {
    const uid = students[r].uid, qid = qids[c];
    const mv = moveCell(r, c, e.key, students.length, qids.length);
    if (mv) { e.preventDefault(); focusCell(mv[0], mv[1]); return; }
    const m = keyToMark(e.key);
    if (m !== undefined) { e.preventDefault(); setGrid((g) => setCell(g, uid, qid, m ?? undefined)); }
  };

  if (students.length === 0) return <Notice>This class has no students yet. Add them in Classes.</Notice>;
  return (
    <View>
      <Panel
        title={task.title}
        right={<View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {dirtyUids.length > 0 ? <Muted>{dirtyUids.length} unsaved</Muted> : <Muted>All saved</Muted>}
          <Button title={`Save all (${dirtyUids.length})`} small onPress={() => void saveAll()} disabled={dirtyUids.length === 0 || Object.values(saving).some(Boolean)} />
        </View>}
      >
        <Muted style={{ marginBottom: space.m }}>Click a box or press Space to cycle ✓ / ✗ / blank. Keys: 1 or Y = ✓, 2 or N = ✗, 0 = blank, arrows move. Blank questions are not marked.</Muted>
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", paddingBottom: 6 }}>
              <View style={{ width: 200 }}><Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft }}>Student</Text></View>
              {qids.map((id, i) => (
                <View key={id} style={{ width: CELL + 6, alignItems: "center" }} {...(Platform.OS === "web" ? ({ title: titles[i] } as object) : {})}>
                  <Text style={{ fontSize: 14, fontFamily: fonts.displayMedium, color: colors.ink }}>Q{i + 1}</Text>
                </View>
              ))}
              <View style={{ width: 70, alignItems: "center" }}><Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft }}>Score</Text></View>
              <View style={{ width: 210 }}><Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft }}>Save</Text></View>
            </View>
            {students.map((s, r) => {
              const sum = markSummary(grid[s.uid], qids);
              const isDirty = dirty(s.uid);
              return (
                <View key={s.uid} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 3, borderTopWidth: 1, borderTopColor: "#eadfd3", backgroundColor: isDirty ? colors.highlight : "transparent" }}>
                  <View style={{ width: 200, paddingRight: 8 }}>
                    <Text style={{ fontSize: 15, color: colors.ink }} numberOfLines={1}>{s.displayName}</Text>
                    {sources.get(s.uid) === "app" ? <Text style={{ fontSize: 11, color: colors.inkSoft }}>Taken in the app</Text> : null}
                  </View>
                  {qids.map((qid, c) => (
                    <Cell key={qid} value={grid[s.uid]?.[qid]} label={`${s.displayName}, question ${c + 1}`}
                      innerRef={(el) => { if (el) cells.current.set(`${r},${c}`, el as { focus?: () => void }); else cells.current.delete(`${r},${c}`); }}
                      onToggle={() => setGrid((g) => setCell(g, s.uid, qid, cycleMark(g[s.uid]?.[qid])))} onKey={onKey(r, c)} />
                  ))}
                  <View style={{ width: 70, alignItems: "center" }}>
                    <Text style={{ fontSize: 15, fontFamily: fonts.displayMedium, color: colors.ink }}>{sum.right}/{qids.length}</Text>
                  </View>
                  <View style={{ width: 210, flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Button title={saving[s.uid] ? "…" : "Save"} small variant={isDirty ? "primary" : "ghost"} onPress={() => void save(s.uid)} disabled={!isDirty || !!saving[s.uid]} style={{ paddingHorizontal: 10 }} />
                    <Pressable onPress={() => setGrid((g) => setRow(g, s.uid, qids, "right"))} accessibilityRole="button" accessibilityLabel={`Mark all right for ${s.displayName}`}><Text style={{ fontSize: 12, color: colors.primaryDark, fontFamily: fonts.displayMedium }}>All ✓</Text></Pressable>
                    <Pressable onPress={() => setGrid((g) => setRow(g, s.uid, qids, undefined))} accessibilityRole="button" accessibilityLabel={`Clear marks for ${s.displayName}`}><Text style={{ fontSize: 12, color: colors.inkSoft, fontFamily: fonts.displayMedium }}>Clear</Text></Pressable>
                    {stars[s.uid] !== undefined ? <Text style={{ fontSize: 13, color: "#a06a00", fontFamily: fonts.displayMedium }}>★ +{stars[s.uid]}</Text> : null}
                  </View>
                  {errors[s.uid] ? <Text style={{ color: colors.bad, fontSize: 13, maxWidth: 240 }}>{errors[s.uid]}</Text> : null}
                </View>
              );
            })}
            <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 8, borderTopWidth: 2, borderTopColor: colors.border }}>
              <View style={{ width: 200 }}><Text style={{ fontSize: 13, color: colors.inkSoft, fontFamily: fonts.displayMedium }}>Class: ✓ / ✗</Text></View>
              {qids.map((qid) => {
                const c = columnSummary(grid, students.map((s) => s.uid), qid);
                return <View key={qid} style={{ width: CELL + 6, alignItems: "center" }}><Text style={{ fontSize: 12, color: colors.inkSoft }}>{c.right} / {c.wrong}</Text></View>;
              })}
            </View>
          </View>
        </ScrollView>
      </Panel>
      <Panel title="Questions">
        {qids.map((id, i) => {
          const q = getQuestion(task.grade, id);
          return (
            <View key={id} style={{ flexDirection: "row", gap: space.m, paddingVertical: 4 }}>
              <Text style={{ width: 34, fontSize: 14, fontFamily: fonts.displayMedium, color: colors.ink }}>Q{i + 1}</Text>
              <Text style={{ flex: 1, fontSize: 14, color: colors.ink }} numberOfLines={2}>{q ? richToPlain(q.stem) : id}</Text>
              {q ? <Badge text={q.type === "mcq" ? "MCQ" : "Open"} tone="grey" /> : null}
            </View>
          );
        })}
      </Panel>
    </View>
  );
}

export function MarkingSection() {
  const cls = useTeacher(selectedClass);
  const hand = useTeacher((s) => s.markTaskId);
  const tasks = useLoad(() => (cls ? backend.listTasks(cls.id) : Promise.resolve([])), [cls?.id]);
  const [taskId, setTaskId] = useState<string | null>(hand);
  useEffect(() => { if (hand) setTaskId(hand); }, [hand]);
  const list = [...(tasks.data ?? [])].sort((a, b) => b.createdAt - a.createdAt);
  const task = list.find((t) => t.id === taskId) ?? list[0];
  const marks = useLoad(() => (cls && task ? backend.getTaskMarks(cls.id, task.id) : Promise.resolve([])), [cls?.id, task?.id]);

  if (!cls) return <><PageHeader title="Marking" /><Notice>Create a class first (Classes).</Notice></>;
  return (
    <View>
      <PageHeader title="Marking" subtitle="Mark paper work right or wrong. It counts like answers in the app." />
      {tasks.error ? <Notice kind="error" onRetry={tasks.reload}>{tasks.error}</Notice> : null}
      {tasks.loading && !tasks.data ? <Spinner /> : list.length === 0 ? <Notice>No worksheets or tests yet. Create one in Worksheets & tests.</Notice> : (
        <>
          <Panel title="Which worksheet or test?">
            <PillRow>{list.map((t) => <Pill key={t.id} label={t.title} selected={t.id === task?.id} onPress={() => setTaskId(t.id)} />)}</PillRow>
          </Panel>
          {marks.error ? <Notice kind="error" onRetry={marks.reload}>{marks.error}</Notice> : null}
          {marks.loading ? <Spinner label="Loading marks…" /> : task && marks.data ? <MarkGrid key={`${cls.id}/${task.id}/${cls.students.length}`} cls={cls} task={task} saved={marks.data} /> : null}
        </>
      )}
    </View>
  );
}
