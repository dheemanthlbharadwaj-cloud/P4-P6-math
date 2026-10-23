// Teachers: list, add (a new login's password is shown once), rename, disable / enable, reset password.
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { TeacherDoc } from "@p6/shared";
import { Button } from "../../components/ui";
import { colors, space } from "../../theme/colors";
import { backend } from "../client";
import { canSaveTeacher, sortTeachers, teacherClassCount } from "../helpers";
import { useAdmin } from "../store";
import { Badge, ConfirmButton, Field, Muted, Notice, PageHeader, Panel, SecretBox, Table, useAction } from "../ui";

interface Secret { title: string; password: string }

function AddTeacher({ onSecret }: { onSecret: (s: Secret | null) => void }) {
  const upsertTeacher = useAdmin((s) => s.upsertTeacher);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const add = () => void run(async () => {
    setDone(null); onSecret(null);
    const r = await backend.saveTeacher(email.trim(), name.trim());
    upsertTeacher(r.teacher);
    if (r.password) onSecret({ title: `Password for ${r.teacher.name} (${r.teacher.email})`, password: r.password });
    else setDone(`${r.teacher.name} is a teacher now. They already had a login, so their password is unchanged.`);
    setName(""); setEmail("");
  });
  return (
    <Panel title="Add teacher">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {done ? <Notice kind="good">{done}</Notice> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap" }}>
        <Field label="Name" placeholder="e.g. Ms Tan" value={name} onChangeText={setName} style={{ width: 240, marginBottom: 0 }} />
        <Field label="Email" placeholder="teacher@school.edu.sg" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} onSubmitEditing={add} style={{ width: 300, marginBottom: 0 }} />
        <Button title={busy ? "Adding…" : "Add teacher"} onPress={add} disabled={busy || !canSaveTeacher(name, email)} />
      </View>
    </Panel>
  );
}

function TeacherDetail({ t, onSecret }: { t: TeacherDoc; onSecret: (s: Secret | null) => void }) {
  const { patchTeacher, upsertTeacher } = useAdmin();
  const [name, setName] = useState(t.name);
  useEffect(() => setName(t.name), [t.uid, t.name]);
  const { busy, error, run } = useAction();
  const rename = () => void run(async () => { const r = await backend.saveTeacher(t.email, name.trim(), t.uid); upsertTeacher(r.teacher); });
  const toggle = () => void run(async () => { await backend.setTeacherActive(t.uid, !t.active); patchTeacher(t.uid, { active: !t.active }); });
  const reset = () => void run(async () => {
    onSecret(null);
    const password = await backend.resetPassword(t.uid);
    onSecret({ title: `New password for ${t.name} (${t.email})`, password });
  });
  return (
    <View style={{ gap: space.m }}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap" }}>
        <Field label="Name" value={name} onChangeText={setName} onSubmitEditing={rename} style={{ width: 260, marginBottom: 0 }} />
        <Button title="Rename" variant="ghost" small onPress={rename} disabled={busy || !name.trim() || name.trim() === t.name} />
        <View style={{ marginLeft: "auto", flexDirection: "row", gap: space.s, flexWrap: "wrap" }}>
          <ConfirmButton title="Reset password" confirmTitle="Sure? Make a new password" onConfirm={reset} disabled={busy} />
          <ConfirmButton title={t.active ? "Disable" : "Enable"} confirmTitle={t.active ? "Sure? Disable this teacher" : "Sure? Enable this teacher"} onConfirm={toggle} disabled={busy} />
        </View>
      </View>
    </View>
  );
}

export function TeachersSection() {
  const { teachers, classes } = useAdmin();
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const list = sortTeachers(teachers);
  return (
    <View>
      <PageHeader title="Teachers" subtitle="Everyone who can sign in to the teacher dashboard." />
      {secret ? <SecretBox title={secret.title} password={secret.password} onClose={() => setSecret(null)} /> : null}
      <Panel title={`All teachers (${list.length})`}>
        <Table
          columns={[{ key: "n", title: "Name", flex: 2 }, { key: "e", title: "Email", flex: 3 }, { key: "a", title: "Status", flex: 1 }, { key: "c", title: "Classes", flex: 1 }]}
          empty="No teachers yet. Add the first one below."
          rows={list.map((t) => ({
            key: t.uid,
            highlight: t.uid === openUid,
            onPress: () => { setOpenUid(t.uid === openUid ? null : t.uid); },
            cells: [
              <Text key="n" style={{ fontSize: 15, color: t.active ? colors.ink : colors.muted }}>{t.name}</Text>,
              t.email,
              <Badge key="a" text={t.active ? "Active" : "Disabled"} tone={t.active ? "green" : "grey"} />,
              String(teacherClassCount(classes, t.uid)),
            ],
            expanded: t.uid === openUid ? <TeacherDetail t={t} onSecret={setSecret} /> : undefined,
          }))}
        />
        <Muted style={{ marginTop: space.s }}>Click a teacher to rename, disable or reset their password.</Muted>
      </Panel>
      <AddTeacher onSecret={setSecret} />
    </View>
  );
}
