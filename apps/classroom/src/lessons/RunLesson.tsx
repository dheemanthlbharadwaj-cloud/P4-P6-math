// Run a lesson: pick the day and the children who were there, then for each child tap :) :| :( per learning goal, tick
// the parts they finished (teachers only: parents never see this) and add a note. The feedback message for each family
// (siblings share one, as in the owner's example) is written from the lesson's prepared sentences; edit it, copy it to
// WhatsApp, and Save: the lesson then shows up for those parents.
import React, { useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { FACES, feedbackText, type Child, type Face, type Lesson, type SessionChildInput } from "@p6/shared";
import { Button } from "../components/ui";
import { Badge, Field, Muted, Notice, PageHeader, Panel, Pill, PillRow, useAction } from "../components/dash";
import { copyText } from "../admin/ui";
import { colors, fonts, radius, space } from "../theme/colors";
import { backend } from "./client";
import { useTeacher } from "./store";
import { fromDayInput, toDayInput } from "./format";

type Entry = Omit<SessionChildInput, "childId">;
const blank = (): Entry => ({ goals: {}, note: "", partsDone: [] });

function FaceButtons({ value, onChange }: { value?: Face; onChange: (f?: Face) => void }) {
  const tone: Record<Face, string> = { good: colors.goodBg, ok: colors.highlight, bad: colors.badBg };
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {FACES.map((f) => {
        const on = value === f.id;
        return (
          <Pressable key={f.id} onPress={() => onChange(on ? undefined : f.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={f.label}
            style={{ minWidth: 52, height: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.s, borderWidth: on ? 3 : 2, borderColor: on ? colors.border : "#d9cfc4", backgroundColor: on ? tone[f.id] : "#fff" }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink }}>{f.emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ChildCard({ child, lesson, entry, onChange }: { child: Child; lesson: Lesson; entry: Entry; onChange: (e: Entry) => void }) {
  const togglePart = (id: string) => onChange({ ...entry, partsDone: entry.partsDone.includes(id) ? entry.partsDone.filter((p) => p !== id) : [...entry.partsDone, id] });
  return (
    <Panel title={child.name}>
      {lesson.goals.map((g) => (
        <View key={g.id} style={{ flexDirection: "row", alignItems: "center", gap: space.m, flexWrap: "wrap", marginBottom: space.s }}>
          <Text style={{ flex: 1, minWidth: 180, fontSize: 15, color: colors.ink }}>{g.text}</Text>
          <FaceButtons value={entry.goals[g.id]} onChange={(f) => { const goals = { ...entry.goals }; if (f) goals[g.id] = f; else delete goals[g.id]; onChange({ ...entry, goals }); }} />
        </View>
      ))}
      {lesson.parts.length ? (
        <View style={{ marginTop: space.s, padding: space.m, borderRadius: radius.s, backgroundColor: "#f4f0ea" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, marginBottom: 6 }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft }}>Parts finished</Text>
            <Badge text="Teachers only" tone="grey" />
          </View>
          <PillRow>{lesson.parts.map((p) => <Pill key={p.id} label={`${entry.partsDone.includes(p.id) ? "✓ " : ""}${p.title}`} selected={entry.partsDone.includes(p.id)} onPress={() => togglePart(p.id)} />)}</PillRow>
        </View>
      ) : null}
      <Field label="Note for the parent (optional)" value={entry.note} onChangeText={(note) => onChange({ ...entry, note })} multiline style={{ marginTop: space.m }} />
    </Panel>
  );
}

function FamilyMessage({ title, text, edited, onChange, onRewrite }: { title: string; text: string; edited: boolean; onChange: (t: string) => void; onRewrite: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <Panel title={`Message for ${title}`} right={<View style={{ flexDirection: "row", gap: 6 }}>
      {edited ? <Button title="Write it again" small variant="ghost" onPress={onRewrite} /> : null}
      <Button title={copied ? "Copied" : "Copy for WhatsApp"} small variant="good" onPress={() => { void copyText(text).then(setCopied); setTimeout(() => setCopied(null), 2500); }} />
    </View>}>
      <Field value={text} onChangeText={onChange} multiline accessibilityLabel={`Message for ${title}`} style={{ marginBottom: 0 }} />
      {copied === false ? <Muted>Couldn't copy: select the text and copy it by hand.</Muted> : null}
    </Panel>
  );
}

export function RunLesson({ lesson, onBack }: { lesson: Lesson; onBack: () => void }) {
  const { families, children } = useTeacher();
  const wide = useWindowDimensions().width >= 1100;
  const [day, setDay] = useState(toDayInput(Date.now()));
  const [picked, setPicked] = useState<string[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [edits, setEdits] = useState<Record<string, string>>({}); // familyId → text edited by hand
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useAction();
  const date = fromDayInput(day);
  const kid = (id: string) => children.find((c) => c.id === id);
  const toggle = (id: string) => { setSaved(false); setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); };
  const entryOf = (id: string) => entries[id] ?? blank();
  const setEntry = (id: string, e: Entry) => { setSaved(false); setEntries((x) => ({ ...x, [id]: e })); };

  // one message per family of the children picked
  const groups = useMemo(() => families
    .map((f) => ({ family: f, kids: f.childIds.filter((id) => picked.includes(id)).map(kid).filter((c): c is Child => !!c) }))
    .filter((g) => g.kids.length), [families, picked, children]); // eslint-disable-line react-hooks/exhaustive-deps
  const generated = (g: (typeof groups)[number]) => feedbackText({ parentName: g.family.parentName, lesson, children: g.kids.map((c) => ({ name: c.name, ...entryOf(c.id) })) });
  const textOf = (g: (typeof groups)[number]) => edits[g.family.id] ?? generated(g);

  const save = () => void run(async () => {
    if (!date) throw new Error("Type the date as YYYY-MM-DD.");
    const r = await backend.saveSession({
      ...(sessionId ? { id: sessionId } : {}), lessonId: lesson.id, date,
      reports: picked.map((id) => ({ childId: id, ...entryOf(id) })),
      familyTexts: Object.fromEntries(groups.map((g) => [g.family.id, textOf(g)])),
    });
    setSessionId(r.session.id);
    setSaved(true);
  });

  const sortedFamilies = [...families].sort((a, b) => a.parentName.localeCompare(b.parentName));
  return (
    <View>
      <PageHeader title={lesson.title} subtitle={`Run lesson · ${lesson.level}`} right={<Button title="Back to lessons" small variant="ghost" onPress={onBack} />} />
      <Panel title="1. Who was there?">
        <Field label="Day" value={day} onChangeText={(v) => { setSaved(false); setDay(v); }} placeholder="YYYY-MM-DD" style={{ width: 180 }} hint={date ? undefined : "Type the date as YYYY-MM-DD"} />
        {sortedFamilies.length === 0 ? <Muted>No students yet: add families under Students first.</Muted> : null}
        {sortedFamilies.map((f) => (
          <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: space.m, flexWrap: "wrap", marginBottom: 6 }}>
            <Text style={{ width: 160, fontSize: 13, color: colors.inkSoft }} numberOfLines={1}>{f.parentName}</Text>
            <PillRow>{f.childIds.map(kid).filter((c): c is Child => !!c).map((c) => <Pill key={c.id} label={c.name} selected={picked.includes(c.id)} onPress={() => toggle(c.id)} />)}</PillRow>
          </View>
        ))}
      </Panel>
      {picked.length ? (
        <View style={wide ? { flexDirection: "row", gap: space.l, alignItems: "flex-start" } : undefined}>
          <View style={wide ? { flex: 1, minWidth: 0 } : undefined}>
            <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink, marginBottom: space.s }}>2. How did each child do?</Text>
            {picked.map(kid).filter((c): c is Child => !!c).map((c) => <ChildCard key={c.id} child={c} lesson={lesson} entry={entryOf(c.id)} onChange={(e) => setEntry(c.id, e)} />)}
          </View>
          <View style={wide ? { flex: 1, minWidth: 0 } : undefined}>
            <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink, marginBottom: space.s }}>3. Messages for the parents</Text>
            {groups.map((g) => (
              <FamilyMessage key={g.family.id} title={g.family.parentName} text={textOf(g)} edited={g.family.id in edits}
                onChange={(t) => { setSaved(false); setEdits((x) => ({ ...x, [g.family.id]: t })); }}
                onRewrite={() => setEdits((x) => { const { [g.family.id]: _drop, ...rest } = x; return rest; })} />
            ))}
            {error ? <Notice kind="error">{error}</Notice> : null}
            {saved ? <Notice kind="good">Saved. The parents can now see this lesson. Changes after this save again into the same lesson.</Notice> : null}
            <Button title={busy ? "Saving…" : sessionId ? "Save changes" : "Save lesson"} onPress={save} disabled={busy || !date} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
