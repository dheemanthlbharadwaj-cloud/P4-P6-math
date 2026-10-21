// Classes: create / rename / delete, and the roster (add by friend code, remove, birthday MM-DD).
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { ClassDoc, ClassStudent, Grade } from "@p6/shared";
import { CLASS_LIMITS } from "@p6/shared";
import { Button } from "../../components/ui";
import { colors, fonts, space } from "../../theme/colors";
import { backend } from "../client";
import { formatBirthday, normalizeBirthday, sortRoster } from "../helpers";
import { selectedClass, useTeacher } from "../store";
import { ConfirmButton, Field, Muted, Notice, PageHeader, Panel, Pill, PillRow, Table, useAction } from "../ui";

const GRADES: Grade[] = ["P4", "P5", "P6"];

function NewClass() {
  const { setClasses, selectClass } = useTeacher();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<Grade>("P6");
  const { busy, error, run } = useAction();
  const create = () => void run(async () => {
    const { classId } = await backend.saveClass({ name: name.trim(), grade });
    const d = await backend.getDashboard();
    setClasses(d.classes); selectClass(classId); setName("");
  });
  return (
    <Panel title="New class">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap" }}>
        <Field label="Class name" placeholder="e.g. 6 Courage" value={name} onChangeText={setName} onSubmitEditing={create} style={{ width: 260, marginBottom: 0 }} />
        <View>
          <Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4 }}>Level</Text>
          <PillRow>{GRADES.map((g) => <Pill key={g} label={g} selected={g === grade} onPress={() => setGrade(g)} />)}</PillRow>
        </View>
        <Button title={busy ? "Creating…" : "Create class"} onPress={create} disabled={busy || !name.trim()} />
      </View>
    </Panel>
  );
}

function StudentRow({ cls, s, onChanged }: { cls: ClassDoc; s: ClassStudent; onChanged: (patch: (students: ClassStudent[]) => ClassStudent[]) => void }) {
  const [text, setText] = useState(s.birthday ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  useEffect(() => setText(s.birthday ?? ""), [s.birthday]);
  const dirty = (normalizeBirthday(text) ?? text.trim()) !== (s.birthday ?? "");
  const save = () => {
    const clear = text.trim() === "";
    const n = clear ? null : normalizeBirthday(text);
    if (!clear && !n) { setMsg("Use MM-DD, e.g. 03-07"); return; }
    setMsg(null);
    void run(async () => {
      await backend.setBirthday(cls.id, s.uid, n);
      onChanged((list) => list.map((x) => (x.uid === s.uid ? { ...x, birthday: n ?? undefined } : x)));
    });
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, flexWrap: "wrap" }}>
      <Field value={text} onChangeText={(t) => { setText(t); setMsg(null); }} placeholder="MM-DD" onSubmitEditing={save} maxLength={5} accessibilityLabel={`Birthday of ${s.displayName}`} style={{ width: 90, marginBottom: 0 }} />
      <Button title={busy ? "…" : "Save"} small variant="ghost" onPress={save} disabled={busy || !dirty} />
      {msg || error ? <Text style={{ color: colors.bad, fontSize: 13 }}>{msg ?? error}</Text> : s.birthday ? <Text style={{ color: colors.inkSoft, fontSize: 13 }}>{formatBirthday(s.birthday)}</Text> : null}
    </View>
  );
}

function Roster({ cls }: { cls: ClassDoc }) {
  const { patchClass } = useTeacher();
  const [code, setCode] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const add = useAction();
  const rm = useAction();
  const setStudents = (f: (s: ClassStudent[]) => ClassStudent[]) => patchClass(cls.id, { students: f(cls.students) });
  const addStudent = () => void add.run(async () => {
    const st = await backend.addStudent(cls.id, code.trim());
    setStudents((l) => [...l.filter((x) => x.uid !== st.uid), st]); setCode(""); setAdded(`${st.displayName} joined ${cls.name}.`);
  });
  const roster = sortRoster(cls.students);
  return (
    <Panel title={`Students in ${cls.name}`} right={<Muted>{cls.students.length} of {CLASS_LIMITS.maxStudents}</Muted>}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap", marginBottom: space.m }}>
        <Field label="Add a student by friend code" placeholder="Friend code" value={code} onChangeText={(t) => { setCode(t); setAdded(null); }} autoCapitalize="characters" autoCorrect={false} onSubmitEditing={addStudent} style={{ width: 260, marginBottom: 0 }} />
        <Button title={add.busy ? "Adding…" : "Add student"} onPress={addStudent} disabled={add.busy || code.trim().length < 3} />
      </View>
      {add.error ? <Notice kind="error">{add.error}</Notice> : null}
      {added ? <Notice kind="good">{added}</Notice> : null}
      {rm.error ? <Notice kind="error">{rm.error}</Notice> : null}
      <Table
        columns={[{ key: "n", title: "Name", flex: 2 }, { key: "b", title: "Birthday (MM-DD)", flex: 3 }, { key: "x", title: "", width: 150, align: "right" }]}
        empty="No students yet. Ask each student for their friend code (Profile in the app) and add them above."
        rows={roster.map((s) => ({
          key: s.uid,
          cells: [
            <Text key="n" style={{ fontSize: 15, color: colors.ink }}>{s.displayName}</Text>,
            <StudentRow key="b" cls={cls} s={s} onChanged={setStudents} />,
            <View key="x" style={{ alignItems: "flex-end" }}>
              <ConfirmButton title="Remove" confirmTitle="Sure? Remove" disabled={rm.busy} onConfirm={() => void rm.run(async () => { await backend.removeStudent(cls.id, s.uid); setStudents((l) => l.filter((x) => x.uid !== s.uid)); })} />
            </View>,
          ],
        }))}
      />
    </Panel>
  );
}

function ClassSettings({ cls }: { cls: ClassDoc }) {
  const { patchClass, setClasses } = useTeacher();
  const [name, setName] = useState(cls.name);
  useEffect(() => setName(cls.name), [cls.id, cls.name]);
  const { busy, error, run } = useAction();
  const rename = () => void run(async () => { await backend.saveClass({ id: cls.id, name: name.trim(), grade: cls.grade }); patchClass(cls.id, { name: name.trim() }); });
  const del = () => void run(async () => { await backend.deleteClass(cls.id); setClasses(useTeacher.getState().classes.filter((c) => c.id !== cls.id)); });
  return (
    <Panel title="Class settings">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap" }}>
        <Field label="Class name" value={name} onChangeText={setName} onSubmitEditing={rename} style={{ width: 260, marginBottom: 0 }} />
        <Button title="Rename" variant="ghost" onPress={rename} disabled={busy || !name.trim() || name.trim() === cls.name} />
        <View style={{ marginLeft: "auto" }}>
          <ConfirmButton title="Delete class" confirmTitle="Sure? Delete the class, its posts and tests" onConfirm={del} disabled={busy} />
        </View>
      </View>
    </Panel>
  );
}

export function ClassesSection() {
  const { classes, classId, selectClass } = useTeacher();
  const cls = useTeacher(selectedClass);
  return (
    <View>
      <PageHeader title="Classes" subtitle="Your classes and who is in them." />
      {classes.length > 0 ? (
        <Panel title="Your classes">
          <Table
            columns={[{ key: "n", title: "Class", flex: 3 }, { key: "g", title: "Level", flex: 1 }, { key: "s", title: "Students", flex: 1 }, { key: "b", title: "Birthdays set", flex: 1 }]}
            rows={classes.map((c) => ({
              key: c.id, highlight: c.id === classId, onPress: () => selectClass(c.id),
              cells: [c.name, c.grade, String(c.students.length), `${c.students.filter((s) => s.birthday).length}`],
            }))}
          />
        </Panel>
      ) : <Notice>You have no classes yet. Create your first class below.</Notice>}
      <NewClass />
      {cls ? <><Roster cls={cls} /><ClassSettings cls={cls} /></> : null}
    </View>
  );
}
