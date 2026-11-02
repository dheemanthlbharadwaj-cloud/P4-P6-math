// Logins (students and teachers): find one by friend code, email or uid, then disable / enable the sign-in, reset the
// password, move the student between classes or make them a teacher.
import React, { useState } from "react";
import { Text, View } from "react-native";
import type { AdminUserRow } from "@p6/shared";
import { Button } from "../../components/ui";
import { colors, fonts, radius, space } from "../../theme/colors";
import { backend } from "../client";
import { canResetPassword, canSearch, classNamesFor, formatDate, joinableClasses, normalizeQuery, signInMethods } from "../helpers";
import { useAdmin } from "../store";
import { Badge, ConfirmButton, Field, Muted, Notice, PageHeader, Panel, SecretBox, Select, useAction } from "../ui";

interface Secret { title: string; password: string }

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ minWidth: 150, flexGrow: 1, flexBasis: 150 }}>
      <Text style={{ fontSize: 12, fontFamily: fonts.displayMedium, color: colors.inkSoft }}>{label}</Text>
      {typeof value === "string" ? <Text style={{ fontSize: 15, color: colors.ink }}>{value}</Text> : value}
    </View>
  );
}

function UserCard({ u, onChange, onSecret }: { u: AdminUserRow; onChange: (patch: Partial<AdminUserRow>) => void; onSecret: (s: Secret | null) => void }) {
  const { classes, patchClass, upsertTeacher } = useAdmin();
  const joinable = joinableClasses(u, classes);
  const [joinId, setJoinId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, error, run } = useAction();
  const target = joinable.some((c) => c.id === joinId) ? joinId : joinable[0]?.id ?? "";
  const name = u.displayName || u.email || u.uid;

  const toggleDisabled = () => void run(async () => { await backend.setUserDisabled(u.uid, !u.disabled); onChange({ disabled: !u.disabled }); setMsg(null); });
  const reset = () => void run(async () => { onSecret(null); setMsg(null); const password = await backend.resetPassword(u.uid); onSecret({ title: `New password for ${name}`, password }); });
  const join = () => void run(async () => {
    const cls = classes.find((c) => c.id === target);
    if (!cls || !u.friendCode) return;
    const st = await backend.addStudent(cls.id, u.friendCode);
    patchClass(cls.id, { students: [...cls.students.filter((x) => x.uid !== st.uid), st] });
    onChange({ classIds: [...u.classIds.filter((x) => x !== cls.id), cls.id] }); setMsg(`${name} joined ${cls.name}.`);
  });
  const leave = (classId: string) => void run(async () => {
    const cls = classes.find((c) => c.id === classId);
    await backend.removeStudent(classId, u.uid);
    if (cls) patchClass(classId, { students: cls.students.filter((x) => x.uid !== u.uid) });
    onChange({ classIds: u.classIds.filter((x) => x !== classId) }); setMsg(`${name} left ${cls?.name ?? "the class"}.`);
  });
  const makeTeacher = () => void run(async () => {
    if (!u.email) return;
    const r = await backend.saveTeacher(u.email, name);
    upsertTeacher(r.teacher); onChange({ isTeacher: true, teacherActive: r.teacher.active });
    if (r.password) onSecret({ title: `Password for ${r.teacher.name} (${r.teacher.email})`, password: r.password });
    else setMsg(`${name} is a teacher now. Their password is unchanged.`);
  });

  return (
    <Panel
      title={name}
      right={<View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
        {u.isTeacher ? <Badge text={u.teacherActive === false ? "Teacher (inactive)" : "Teacher"} tone="gold" /> : null}
        {u.disabled ? <Badge text="Disabled" tone="pink" /> : null}
      </View>}
    >
      {error ? <Notice kind="error">{error}</Notice> : null}
      {msg ? <Notice kind="good">{msg}</Notice> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.l, marginBottom: space.m }}>
        <Fact label="Email" value={u.email ?? "-"} />
        <Fact label="Sign-in method" value={signInMethods(u.providers)} />
        <Fact label="Friend code" value={u.friendCode ?? "-"} />
        <Fact label="Level" value={u.grade ?? "-"} />
        <Fact label="Created" value={formatDate(u.createdAt)} />
        <Fact label="Last sign-in" value={formatDate(u.lastSignInAt)} />
      </View>
      <View style={{ marginBottom: space.m }}>
        <Text style={{ fontSize: 12, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4 }}>Classes</Text>
        {u.classIds.length === 0 ? <Muted>Not in any class.</Muted> : (
          <View style={{ gap: 6 }}>
            {classNamesFor(u.classIds, classes).map((c) => (
              <View key={c.id} style={{ flexDirection: "row", alignItems: "center", gap: space.m }}>
                <Text style={{ fontSize: 15, color: colors.ink, minWidth: 160 }}>{c.name}</Text>
                <ConfirmButton title="Remove from class" confirmTitle="Sure? Remove" disabled={busy} onConfirm={() => leave(c.id)} />
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap", paddingTop: space.m, borderTopWidth: 1, borderTopColor: "#eadfd3" }}>
        {u.friendCode && joinable.length > 0 ? (
          <>
            <Select label="Add to class" value={target} onChange={setJoinId} options={joinable.map((c) => ({ value: c.id, label: `${c.name} (${c.teacherName})` }))} style={{ minWidth: 260 }} />
            <Button title="Add to class" small variant="ghost" onPress={join} disabled={busy || !target} />
          </>
        ) : null}
        {canResetPassword(u) ? <ConfirmButton title="Reset password" confirmTitle="Sure? Make a new password" onConfirm={reset} disabled={busy} /> : null}
        {!u.isTeacher && u.email ? <ConfirmButton title="Make teacher" confirmTitle="Sure? Make this login a teacher" onConfirm={makeTeacher} disabled={busy} /> : null}
        <View style={{ marginLeft: "auto" }}>
          <ConfirmButton title={u.disabled ? "Enable sign-in" : "Disable sign-in"} confirmTitle={u.disabled ? "Sure? Enable sign-in" : "Sure? Disable sign-in"} onConfirm={toggleDisabled} disabled={busy} />
        </View>
      </View>
    </Panel>
  );
}

export function LoginsSection() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [searched, setSearched] = useState("");
  const [secret, setSecret] = useState<Secret | null>(null);
  const { busy, error, run } = useAction();
  const search = () => void run(async () => {
    const query = normalizeQuery(q);
    setSecret(null); setUsers(null);
    const found = await backend.findUser(query);
    setUsers(found); setSearched(query);
  });
  return (
    <View>
      <PageHeader title="Logins" subtitle="Find a student or teacher login by friend code, email or uid." />
      {secret ? <SecretBox title={secret.title} password={secret.password} onClose={() => setSecret(null)} /> : null}
      <Panel title="Find a login">
        {error ? <Notice kind="error">{error}</Notice> : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap" }}>
          <Field label="Friend code, email or uid" placeholder="e.g. AISHA123 or name@example.com" value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => canSearch(q) && search()} style={{ width: 380, marginBottom: 0 }} />
          <Button title={busy ? "Searching…" : "Search"} onPress={search} disabled={busy || !canSearch(q)} />
        </View>
      </Panel>
      {users && users.length === 0 ? <Notice>No login matches "{searched}". Check the friend code, or type the full email address.</Notice> : null}
      {(users ?? []).map((u) => (
        <UserCard key={u.uid} u={u} onSecret={setSecret} onChange={(patch) => setUsers((list) => (list ?? []).map((x) => (x.uid === u.uid ? { ...x, ...patch } : x)))} />
      ))}
    </View>
  );
}
