// Classes: every class in one table (filter by teacher), create, rename, move to another teacher, delete, and the roster.
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { AdminClassRow, Grade } from "@p6/shared";
import { CLASS_LIMITS } from "@p6/shared";
import { Button } from "../../components/ui";
import { colors, fonts, space } from "../../theme/colors";
import { backend } from "../client";
import { filterClasses, sortTeachers, teacherNameOf } from "../helpers";
import { useAdmin } from "../store";
import { ConfirmButton, Field, Muted, Notice, PageHeader, Panel, Pill, PillRow, Select, Table, TypeToConfirm, useAction } from "../ui";

const GRADES: Grade[] = ["P4", "P5", "P6"];

function NewClass({ defaultTeacher }: { defaultTeacher: string }) {
  const { teachers, setClasses, selectClass } = useAdmin();
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<Grade>("P6");
  const [teacherUid, setTeacherUid] = useState(defaultTeacher);
  useEffect(() => { if (defaultTeacher) setTeacherUid(defaultTeacher); }, [defaultTeacher]);
  const { busy, error, run } = useAction();
  const options = sortTeachers(teachers).map((t) => ({ value: t.uid, label: t.active ? t.name : `${t.name} (disabled)` }));
  const chosen = teacherUid || options[0]?.value || "";
  const create = () => void run(async () => {
    const { classId } = await backend.saveClass({ name: name.trim(), grade, teacherUid: chosen });
    const row: AdminClassRow = { id: classId, name: name.trim(), grade, teacherUid: chosen, teacherName: teacherNameOf(teachers, chosen), students: [], createdAt: Date.now() };
    setClasses([...useAdmin.getState().classes, row]); selectClass(classId); setName("");
  });
  return (
    <Panel title="New class">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {options.length === 0 ? <Notice>Add a teacher first (Teachers), then you can create their classes here.</Notice> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap" }}>
        <Field label="Class name" placeholder="e.g. 6 Courage" value={name} onChangeText={setName} onSubmitEditing={create} style={{ width: 240, marginBottom: 0 }} />
        <View>
          <Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4 }}>Level</Text>
          <PillRow>{GRADES.map((g) => <Pill key={g} label={g} selected={g === grade} onPress={() => setGrade(g)} />)}</PillRow>
        </View>
        <Select label="Teacher" value={chosen} onChange={setTeacherUid} options={options} style={{ minWidth: 220 }} />
        <Button title={busy ? "Creating…" : "Create class"} onPress={create} disabled={busy || !name.trim() || !chosen} />
      </View>
    </Panel>
  );
}

function ClassSettings({ cls }: { cls: AdminClassRow }) {
  const { teachers, patchClass, setClasses } = useAdmin();
  const [name, setName] = useState(cls.name);
  const [teacherUid, setTeacherUid] = useState(cls.teacherUid);
  useEffect(() => { setName(cls.name); setTeacherUid(cls.teacherUid); }, [cls.id, cls.name, cls.teacherUid]);
  const { busy, error, run } = useAction();
  const rename = () => void run(async () => { await backend.saveClass({ id: cls.id, name: name.trim(), grade: cls.grade, teacherUid: cls.teacherUid }); patchClass(cls.id, { name: name.trim() }); });
  const move = () => void run(async () => {
    await backend.saveClass({ id: cls.id, name: cls.name, grade: cls.grade, teacherUid });
    patchClass(cls.id, { teacherUid, teacherName: teacherNameOf(teachers, teacherUid) });
  });
  const del = () => void run(async () => { await backend.deleteClass(cls.id); setClasses(useAdmin.getState().classes.filter((c) => c.id !== cls.id)); });
  return (
    <Panel title={`Class settings: ${cls.name}`}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap", marginBottom: space.l }}>
        <Field label="Class name" value={name} onChangeText={setName} onSubmitEditing={rename} style={{ width: 260, marginBottom: 0 }} />
        <Button title="Rename" variant="ghost" small onPress={rename} disabled={busy || !name.trim() || name.trim() === cls.name} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap", marginBottom: space.l }}>
        <Select label="Move to teacher" value={teacherUid} onChange={setTeacherUid} options={sortTeachers(teachers).map((t) => ({ value: t.uid, label: t.name }))} style={{ minWidth: 260 }} />
        <ConfirmButton title="Move" confirmTitle={`Sure? Move to ${teacherNameOf(teachers, teacherUid)}`} onConfirm={move} disabled={busy || teacherUid === cls.teacherUid} />
      </View>
      <TypeToConfirm name={cls.name} onConfirm={del} disabled={busy} label="Delete class" />
      <Muted style={{ marginTop: space.s }}>Deleting removes the class, its posts and tests for good.</Muted>
    </Panel>
  );
}

function Roster({ cls }: { cls: AdminClassRow }) {
  const patchClass = useAdmin((s) => s.patchClass);
  const [code, setCode] = useState("");
  const [added, setAdded] = useState<string | null>(null);
  const add = useAction();
  const rm = useAction();
  const addStudent = () => void add.run(async () => {
    const st = await backend.addStudent(cls.id, code.trim());
    patchClass(cls.id, { students: [...cls.students.filter((x) => x.uid !== st.uid), st] }); setCode(""); setAdded(`${st.displayName} joined ${cls.name}.`);
  });
  const roster = [...cls.students].sort((a, b) => a.displayName.localeCompare(b.displayName));
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
        columns={[{ key: "n", title: "Name", flex: 3 }, { key: "x", title: "", width: 150, align: "right" }]}
        empty="No students yet. Add them by friend code above."
        rows={roster.map((s) => ({
          key: s.uid,
          cells: [
            s.displayName,
            <View key="x" style={{ alignItems: "flex-end" }}>
              <ConfirmButton title="Remove" confirmTitle="Sure? Remove" disabled={rm.busy} onConfirm={() => void rm.run(async () => { await backend.removeStudent(cls.id, s.uid); patchClass(cls.id, { students: cls.students.filter((x) => x.uid !== s.uid) }); })} />
            </View>,
          ],
        }))}
      />
    </Panel>
  );
}

export function ClassesSection() {
  const { teachers, classes, classId, selectClass } = useAdmin();
  const [filter, setFilter] = useState("");
  const cls = classes.find((c) => c.id === classId);
  const shown = filterClasses(classes, filter);
  return (
    <View>
      <PageHeader title="Classes" subtitle="Every class, whoever teaches it." />
      <Panel
        title={`All classes (${shown.length})`}
        right={<Select value={filter} onChange={setFilter} options={[{ value: "", label: "All teachers" }, ...sortTeachers(teachers).map((t) => ({ value: t.uid, label: t.name }))]} />}
      >
        <Table
          columns={[{ key: "n", title: "Class", flex: 3 }, { key: "g", title: "Level", flex: 1 }, { key: "t", title: "Teacher", flex: 2 }, { key: "s", title: "Students", flex: 1 }]}
          empty="No classes yet."
          rows={shown.map((c) => ({ key: c.id, highlight: c.id === classId, onPress: () => selectClass(c.id === classId ? null : c.id), cells: [c.name, c.grade, c.teacherName, String(c.students.length)] }))}
        />
        <Muted style={{ marginTop: space.s }}>Click a class to manage it and its students.</Muted>
      </Panel>
      <NewClass defaultTeacher={filter} />
      {cls ? <><ClassSettings cls={cls} /><Roster cls={cls} /></> : null}
    </View>
  );
}
