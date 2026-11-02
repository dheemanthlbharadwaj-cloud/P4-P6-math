// Students: families (one parent code each, showing every child of the family) and their children. Add a family →
// its code is shown ONCE; New code replaces it (the old code and its sign-ins stop); Delete removes the family, its
// children and their reports. Click a child for their profile. Admins see every family and can give one to a teacher.
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { formatFamilyCode, type Child, type Family } from "@p6/shared";
import { Button } from "../../components/ui";
import { Badge, ConfirmButton, Field, Muted, Notice, PageHeader, Panel, useAction } from "../../components/dash";
import { SecretBox, Select, TypeToConfirm } from "../../admin/ui";
import { colors, fonts, radius, space } from "../../theme/colors";
import { backend } from "../client";
import { useTeacher } from "../store";
import { formatDay } from "../format";

interface KidRow { id?: string; name: string; level: string }
interface Secret { title: string; code: string }

function FamilyForm({ start, onDone }: { start?: { family: Family; kids: Child[] }; onDone: (r?: { family: Family; children: Child[]; code?: string }) => void }) {
  const teachers = useTeacher((s) => s.teachers);
  const [parentName, setParentName] = useState(start?.family.parentName ?? "");
  const [teacherUid, setTeacherUid] = useState(start?.family.teacherUid ?? "");
  const [kids, setKids] = useState<KidRow[]>(start?.kids.map((k) => ({ id: k.id, name: k.name, level: String(k.level) })) ?? [{ name: "", level: "P5" }]);
  const { busy, error, run } = useAction();
  const setKid = (i: number, p: Partial<KidRow>) => setKids((ks) => ks.map((k, j) => (j === i ? { ...k, ...p } : k)));
  const save = () => void run(async () => onDone(await backend.saveFamily({ ...(start ? { id: start.family.id } : {}), parentName, ...(teacherUid ? { teacherUid } : {}), children: kids })));
  return (
    <Panel title={start ? `Edit family: ${start.family.parentName}` : "Add a family"}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.m }}>
        <Field label="Parent's name" value={parentName} onChangeText={setParentName} placeholder="e.g. Ning Lee" style={{ minWidth: 240, flexGrow: 1 }} />
        {teachers ? <Select label="Teacher" value={teacherUid} onChange={setTeacherUid} options={[{ value: "", label: start ? "(keep)" : "Me" }, ...teachers.map((t) => ({ value: t.uid, label: t.name }))]} style={{ minWidth: 200 }} /> : null}
      </View>
      {kids.map((k, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap" }}>
          <Field label={`Child ${i + 1}`} value={k.name} onChangeText={(name) => setKid(i, { name })} placeholder="Full name" style={{ minWidth: 220, flexGrow: 1 }} />
          <Field label="Level" value={k.level} onChangeText={(level) => setKid(i, { level })} style={{ width: 90 }} />
          {kids.length > 1 ? <Button title="Remove" small variant="ghost" onPress={() => setKids(kids.filter((_, j) => j !== i))} style={{ marginBottom: space.m }} /> : null}
        </View>
      ))}
      {start && kids.length < start.kids.length ? <Notice>A removed child's past lesson reports are kept but no longer shown to the parent.</Notice> : null}
      <Button title="Add another child" small variant="ghost" onPress={() => setKids([...kids, { name: "", level: kids[kids.length - 1]?.level ?? "P5" }])} style={{ alignSelf: "flex-start", marginBottom: space.l }} />
      <View style={{ flexDirection: "row", gap: space.m }}>
        <Button title={busy ? "Saving…" : start ? "Save" : "Add family"} onPress={save} disabled={busy || !parentName.trim() || !kids.some((k) => k.name.trim())} />
        <Button title="Cancel" variant="ghost" onPress={() => onDone()} />
      </View>
    </Panel>
  );
}

function FamilyCard({ family, kids, onEdit, onSecret }: { family: Family; kids: Child[]; onEdit: () => void; onSecret: (s: Secret | null) => void }) {
  const router = useRouter();
  const { teachers, removeFamily } = useTeacher();
  const [deleting, setDeleting] = useState(false);
  const { busy, error, run } = useAction();
  const teacher = teachers?.find((t) => t.uid === family.teacherUid)?.name;
  const newCode = () => void run(async () => { onSecret(null); const { code } = await backend.resetFamilyCode(family.id); onSecret({ title: `New family code for ${family.parentName}`, code }); });
  return (
    <Panel title={family.parentName} right={<View style={{ flexDirection: "row", gap: 6 }}>{teacher ? <Badge text={teacher} tone="blue" /> : null}<Badge text={`Code since ${formatDay(family.codeSetAt)}`} tone="grey" /></View>}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s, marginBottom: space.m }}>
        {kids.map((k) => (
          <Pressable key={k.id} onPress={() => router.push(`/teacher/child/${k.id}`)} accessibilityRole="link"
            style={({ pressed }) => ({ borderWidth: 2, borderColor: colors.border, borderRadius: radius.m, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: pressed ? colors.friend : "#fff" })}>
            <Text style={{ fontSize: 16, fontFamily: fonts.displayMedium, color: colors.ink }}>{k.name}</Text>
            <Text style={{ fontSize: 12, color: colors.inkSoft }}>{k.level} · profile ›</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap" }}>
        <Button title="Edit" small variant="ghost" onPress={onEdit} disabled={busy} />
        <ConfirmButton title="New code" confirmTitle="Sure? The old code stops working" onConfirm={newCode} disabled={busy} />
        <Button title={deleting ? "Keep" : "Delete family"} small variant="ghost" onPress={() => setDeleting(!deleting)} disabled={busy} />
      </View>
      {deleting ? (
        <View style={{ marginTop: space.m }}>
          <Muted style={{ marginBottom: space.s }}>This deletes the family, its children and all their lesson reports. The code stops working.</Muted>
          <TypeToConfirm name={family.parentName} label="Delete family" disabled={busy} onConfirm={() => void run(async () => { await backend.deleteFamily(family.id); removeFamily(family.id); })} />
        </View>
      ) : null}
    </Panel>
  );
}

export function StudentsSection() {
  const { families, children, upsertFamily } = useTeacher();
  const [form, setForm] = useState<null | "new" | string>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [q, setQ] = useState("");
  const kidsOf = (f: Family) => f.childIds.map((id) => children.find((c) => c.id === id)).filter((c): c is Child => !!c);
  const match = (f: Family) => !q.trim() || [f.parentName, ...kidsOf(f).map((k) => k.name)].some((n) => n.toLowerCase().includes(q.trim().toLowerCase()));
  const shown = [...families].filter(match).sort((a, b) => a.parentName.localeCompare(b.parentName));
  const editing = form && form !== "new" ? families.find((f) => f.id === form) : undefined;
  return (
    <View>
      <PageHeader title="Students" subtitle={`${children.length} child${children.length === 1 ? "" : "ren"} in ${families.length} famil${families.length === 1 ? "y" : "ies"}. One code per family shows the parent all their children.`}
        right={form ? undefined : <Button title="Add a family" onPress={() => { setSecret(null); setForm("new"); }} />} />
      {secret ? <SecretBox title={secret.title} password={formatFamilyCode(secret.code)} onClose={() => setSecret(null)} /> : null}
      {form ? (
        <FamilyForm start={editing ? { family: editing, kids: kidsOf(editing) } : undefined}
          onDone={(r) => {
            if (r) { upsertFamily(r.family, r.children); if (r.code) setSecret({ title: `Family code for ${r.family.parentName}`, code: r.code }); }
            setForm(null);
          }} />
      ) : null}
      {families.length > 4 ? <Field label="Find" value={q} onChangeText={setQ} placeholder="Parent or child name" style={{ maxWidth: 360 }} /> : null}
      {families.length === 0 && !form ? <Panel><Muted>No families yet. Add one to get the parent's code.</Muted></Panel> : null}
      {shown.map((f) => <FamilyCard key={f.id} family={f} kids={kidsOf(f)} onEdit={() => { setSecret(null); setForm(f.id); }} onSecret={setSecret} />)}
    </View>
  );
}
