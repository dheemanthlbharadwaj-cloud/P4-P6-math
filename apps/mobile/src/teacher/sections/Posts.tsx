// Posts: write a text post (next class, encouragement, homework) with PDF / image attachments, optionally about a task;
// the class feed with automatic milestone and birthday posts (badge), delete.
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import type { ClassPost, ClassTask, PostAttachment } from "@p6/shared";
import { CLASS_LIMITS } from "@p6/shared";
import { Button } from "../../components/ui";
import { colors, fonts, space } from "../../theme/colors";
import { backend } from "../client";
import { attachmentKind, canPost, formatDateTime, POST_BADGE } from "../helpers";
import { pickFiles } from "../pickFile";
import { selectedClass, useTeacher } from "../store";
import { Badge, ConfirmButton, Field, Muted, Notice, PageHeader, Panel, Pill, PillRow, Spinner, useAction, useLoad } from "../ui";

function Composer({ classId, tasks, onPosted }: { classId: string; tasks: ClassTask[]; onPosted: (p: ClassPost) => void }) {
  const hand = useTeacher((s) => s.postTaskId);
  const [text, setText] = useState("");
  const [taskId, setTaskId] = useState<string | undefined>(hand ?? undefined);
  const [files, setFiles] = useState<PostAttachment[]>([]);
  const [uploading, setUploading] = useState<string[]>([]);
  const up = useAction();
  const post = useAction();
  useEffect(() => { if (hand) { setTaskId(hand); const t = tasks.find((x) => x.id === hand); if (t) setText((cur) => cur || `Answers for ${t.title}`); } }, [hand, tasks]);
  useEffect(() => { setText(""); setFiles([]); setTaskId(undefined); }, [classId]);

  const attach = async () => {
    const picked = await pickFiles("application/pdf,image/*");
    for (const f of picked) {
      setUploading((u) => [...u, f.name]);
      await up.run(async () => {
        const sig = await backend.uploadSignature(classId, f.name);
        const url = await backend.uploadFile(sig, f);
        setFiles((l) => [...l, { name: f.name, url, kind: attachmentKind(f.name, f.type) }]);
      });
      setUploading((u) => u.filter((n) => n !== f.name));
    }
  };
  const check = canPost(text, files, CLASS_LIMITS.maxPostChars);
  const submit = () => void post.run(async () => {
    const p = await backend.post({ classId, text: text.trim(), attachments: files.length ? files : undefined, taskId });
    onPosted(p); setText(""); setFiles([]); setTaskId(undefined);
    useTeacher.setState({ postTaskId: null });
  });
  return (
    <Panel title="New post">
      {post.error ? <Notice kind="error">{post.error}</Notice> : null}
      {up.error ? <Notice kind="error">{up.error}</Notice> : null}
      <Field label="Message to the class" multiline placeholder="Next class details, encouragement, homework…" value={text} onChangeText={setText} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: -8, marginBottom: space.m }}>
        <Muted>Students see this in Classroom → Feed.</Muted>
        <Text style={{ fontSize: 13, color: text.length > CLASS_LIMITS.maxPostChars ? colors.bad : colors.inkSoft }}>{text.length}/{CLASS_LIMITS.maxPostChars}</Text>
      </View>
      {tasks.length > 0 ? (
        <View style={{ marginBottom: space.m }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4 }}>About a worksheet or test (optional)</Text>
          <PillRow>
            <Pill label="None" selected={!taskId} onPress={() => setTaskId(undefined)} />
            {tasks.slice(0, 8).map((t) => <Pill key={t.id} label={t.title} selected={taskId === t.id} onPress={() => { setTaskId(t.id); if (!text.trim()) setText(`Answers for ${t.title}`); }} />)}
          </PillRow>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: space.m }}>
        <Button title={uploading.length ? "Uploading…" : "Attach PDF or image"} small variant="ghost" onPress={() => void attach()} disabled={uploading.length > 0} />
        {files.map((f, i) => (
          <View key={f.url + i} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 2, borderColor: colors.border, borderRadius: 14, paddingLeft: 10, paddingRight: 4, paddingVertical: 2, backgroundColor: "#fff" }}>
            <Text style={{ fontSize: 13, color: colors.ink, maxWidth: 220 }} numberOfLines={1}>{f.kind === "pdf" ? "PDF · " : "Image · "}{f.name}</Text>
            <Pressable onPress={() => setFiles((l) => l.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontFamily: fonts.display, color: colors.inkSoft }}>✕</Text>
            </Pressable>
          </View>
        ))}
        {uploading.map((n) => <Muted key={n}>Uploading {n}…</Muted>)}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.m }}>
        <Button title={post.busy ? "Posting…" : "Post to class"} onPress={submit} disabled={!check.ok || post.busy || uploading.length > 0} />
        {!check.ok && (text.length > 0 || files.length > 0) ? <Muted>{check.reason}</Muted> : null}
      </View>
    </Panel>
  );
}

function PostCard({ p, task, onDelete, busy }: { p: ClassPost; task?: ClassTask; onDelete: () => void; busy: boolean }) {
  const badge = POST_BADGE[p.kind];
  return (
    <View style={{ borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: space.m, marginBottom: space.s, backgroundColor: p.kind === "teacher" ? "#fff" : "#fffbf3" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {badge ? <Badge text={badge} tone={p.kind === "birthday" ? "pink" : "gold"} /> : <Badge text="You" tone="blue" />}
        <Muted style={{ fontSize: 13 }}>{formatDateTime(p.createdAt)}</Muted>
        {task ? <Badge text={task.title} tone="grey" /> : null}
        <View style={{ marginLeft: "auto" }}>{p.kind === "teacher" ? <ConfirmButton title="Delete" confirmTitle="Sure? Delete" onConfirm={onDelete} disabled={busy} /> : <ConfirmButton title="Hide" confirmTitle="Sure? Delete" onConfirm={onDelete} disabled={busy} />}</View>
      </View>
      <Text style={{ fontSize: 16, color: colors.ink, lineHeight: 23 }}>{p.text}</Text>
      {p.attachments?.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {p.attachments.map((a, i) => (
            <Pressable key={i} onPress={() => void Linking.openURL(a.url)} accessibilityRole="link" style={{ borderWidth: 2, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.friend }}>
              <Text style={{ fontSize: 13, color: colors.primaryDark, fontFamily: fonts.displayMedium }}>{a.kind === "pdf" ? "PDF" : a.kind === "image" ? "Image" : "Link"} · {a.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function PostsSection() {
  const cls = useTeacher(selectedClass);
  const classId = cls?.id;
  const tasks = useLoad(() => (classId ? backend.listTasks(classId) : Promise.resolve([])), [classId]);
  const feed = useLoad<{ posts: ClassPost[]; listed: boolean }>(async () => {
    if (!classId) return { posts: [], listed: true };
    const l = await backend.listPosts({ classId });
    return { posts: l ?? [], listed: l !== null };
  }, [classId]);
  const del = useAction();
  const [session, setSession] = useState<ClassPost[]>([]);
  useEffect(() => setSession([]), [classId]);
  const taskById = useMemo(() => new Map((tasks.data ?? []).map((t) => [t.id, t])), [tasks.data]);
  const posts = useMemo(() => {
    const seen = new Set<string>();
    return [...session, ...(feed.data?.posts ?? [])].filter((p) => !seen.has(p.id) && !!seen.add(p.id)).sort((a, b) => b.createdAt - a.createdAt);
  }, [session, feed.data]);

  if (!cls) return <><PageHeader title="Posts" /><Notice>Create a class first (Classes).</Notice></>;
  return (
    <View>
      <PageHeader title="Posts" subtitle={`What ${cls.name} sees in Classroom → Feed.`} />
      <Composer classId={cls.id} tasks={tasks.data ?? []} onPosted={(p) => setSession((l) => [p, ...l])} />
      <Panel title="Class feed" right={<Muted>Milestone and birthday posts are added automatically.</Muted>}>
        {feed.error ? <Notice kind="error" onRetry={feed.reload}>{feed.error}</Notice> : null}
        {del.error ? <Notice kind="error">{del.error}</Notice> : null}
        {feed.data && !feed.data.listed ? <Notice>The post history isn't available from the server yet. Posts you write now are shown here until you leave this page.</Notice> : null}
        {feed.loading && !feed.data ? <Spinner /> : null}
        {!feed.loading && posts.length === 0 && !feed.error ? <Muted>No posts yet.</Muted> : null}
        {posts.map((p) => (
          <PostCard key={p.id} p={p} task={p.taskId ? taskById.get(p.taskId) : undefined} busy={del.busy}
            onDelete={() => void del.run(async () => { await backend.deletePost(cls.id, p.id); setSession((l) => l.filter((x) => x.id !== p.id)); feed.set({ listed: feed.data?.listed ?? true, posts: (feed.data?.posts ?? []).filter((x) => x.id !== p.id) }); })} />
        ))}
      </Panel>
    </View>
  );
}
