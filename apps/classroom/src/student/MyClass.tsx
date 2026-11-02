// The Student area: the class feed, tests and worksheets from the teacher, and homework (ported from the game's
// Classroom tab "My class"). Data: getMyClassroom through student/service.ts (fetched when the page opens or comes back
// to the front, at most every 2 minutes, cached per login; offline shows the cache).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Linking, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Body, Button, Card, H2 } from "../components/ui";
import { catPoses } from "../theme/cats";
import { colors, fonts, space } from "../theme/colors";
import { getQuestion, getSubtopic } from "../content";
import { STUDENT_GRADE, accountKey, refreshClassroom } from "./service";
import { emptyAccount, useClassroom } from "./store";
import {
  attachmentIcon, formatDue, formatPostTime, groupTasks, homeworkIds, isNotInClass, postIcon, postLabel, safeUrl, scoreText, sortFeed, worksheetLabel,
} from "../logic/classroom";

const FEED_SHOWN = 5;

export function MyClass() {
  const router = useRouter();
  const columns = useWindowDimensions().width >= 900 ? 2 : 1;
  const grade = STUDENT_GRADE;
  const acct = useClassroom((s) => s.byAccount[accountKey()]) ?? emptyAccount();
  const { data, fetchedAt, homeworkDone, taken } = acct;
  const [loading, setLoading] = useState(!fetchedAt);
  const [offline, setOffline] = useState(false);
  const [more, setMore] = useState(false);
  const now = Date.now();

  useFocusEffect(useCallback(() => {
    let live = true;
    void refreshClassroom().then((ok) => { if (live) { setOffline(!ok); setLoading(false); } });
    return () => { live = false; };
  }, []));
  useEffect(() => { if (fetchedAt) setLoading(false); }, [fetchedAt]);
  // A tab left open: check again when it comes back to the front (still at most every 2 minutes).
  useEffect(() => {
    const onVis = () => { if (!document.hidden) void refreshClassroom().then((ok) => setOffline(!ok)); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const feed = useMemo(() => sortFeed(data.posts), [data.posts]);
  const { tests, paper } = useMemo(() => groupTasks(data.tasks), [data.tasks]);
  const hw = useMemo(() => homeworkIds(data.homework, (id) => !!getQuestion(grade, id), homeworkDone), [data.homework, homeworkDone, grade]);
  const subtopicName = useCallback((id: string) => getSubtopic(grade, id)?.subtopic.name, [grade]);

  if (loading && !fetchedAt) {
    return (<View><H2>My class</H2><Body style={{ color: colors.inkSoft, marginTop: 6 }}>Loading your class...</Body></View>);
  }

  const header = (
    <View>
      <H2>My class</H2>
      {data.classes.length ? (
        <Body style={{ color: colors.inkSoft }}>{data.classes.map((c) => `${c.name}${c.teacherName ? ` · ${c.teacherName}` : ""}`).join("  |  ")}</Body>
      ) : null}
      {offline && fetchedAt ? <Text style={{ color: colors.inkSoft, fontSize: 13, marginTop: 2 }}>No internet. Showing what we saved.</Text> : null}
    </View>
  );

  if (isNotInClass(data)) {
    return (
      <View style={{ gap: space.m }}>
        {header}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={catPoses.confused} style={{ width: 64, height: 60 }} resizeMode="contain" />
            <Body style={{ flex: 1 }}>You're not in any class yet. Ask your teacher to add you with your friend code (it's in the game, under Profile).</Body>
          </View>
          {offline ? <Text style={{ color: colors.inkSoft, marginTop: 8 }}>We could not check just now. Try again when you are online.</Text> : null}
        </Card>
      </View>
    );
  }

  const tasksBlock = tests.length || paper.length ? (
    <View style={{ gap: space.m }}>
      <H2>Tasks</H2>
      {tests.map((t) => {
        const score = taken[t.id];
        return (
          <Card key={t.id}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ fontSize: 28 }}>📝</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>{t.title}</Text>
                <Text style={{ color: colors.inkSoft }}>{t.questionIds.length} questions · one try each{t.dueAt ? ` · due ${formatDue(t.dueAt)}` : ""}</Text>
              </View>
            </View>
            {score ? (
              <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.good, marginTop: 8 }}>Done: {scoreText(score)}</Text>
            ) : (
              <Button title="Take test" style={{ marginTop: 10 }} onPress={() => router.push({ pathname: "/student/test/[taskId]", params: { taskId: t.id } })} />
            )}
          </Card>
        );
      })}
      {paper.map((t) => (
        <Card key={t.id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 28 }}>{t.kind === "worksheet" ? "📄" : "✏️"}</Text>
            <Body style={{ flex: 1 }}>{t.kind === "worksheet" ? worksheetLabel(t, subtopicName) : `Test on paper from your teacher: ${t.title}`}</Body>
          </View>
        </Card>
      ))}
    </View>
  ) : null;

  const homeworkBlock = hw.length ? (
    <View style={{ gap: space.m }}>
      <H2>Homework</H2>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Image source={catPoses.cup} style={{ width: 56, height: 52 }} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink }}>{hw.length} question{hw.length === 1 ? "" : "s"} to try again</Text>
            <Text style={{ color: colors.inkSoft }}>Your teacher marked these. Get one right and it leaves the list.</Text>
          </View>
        </View>
        <Button title="Start homework" variant="gold" style={{ marginTop: 10 }}
          onPress={() => router.push("/student/homework")} />
      </Card>
    </View>
  ) : null;

  const shown = more ? feed : feed.slice(0, FEED_SHOWN);
  const feedBlock = (
    <View style={{ gap: space.m }}>
      <H2>Class feed</H2>
      {feed.length === 0 ? <Card><Body style={{ color: colors.inkSoft }}>No news yet.</Body></Card> : null}
      {shown.map((p) => (
        <Card key={p.id} style={p.kind === "birthday" ? { backgroundColor: colors.highlight } : undefined}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Text style={{ fontSize: 26 }} accessibilityLabel={postLabel(p.kind)}>{postIcon(p.kind)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.inkSoft, fontSize: 13, fontFamily: fonts.displayMedium }}>{postLabel(p.kind)} · {formatPostTime(p.createdAt, now)}</Text>
              <Body style={{ marginTop: 2 }}>{p.text}</Body>
              {p.attachments?.map((a, i) => {
                const url = safeUrl(a.url);
                return url ? (
                  <Pressable key={i} accessibilityRole="link" onPress={() => void Linking.openURL(url)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.friend }}>
                    <Text style={{ fontSize: 18 }}>{attachmentIcon(a.kind)}</Text>
                    <Text numberOfLines={1} style={{ flex: 1, color: colors.primaryDark, fontFamily: fonts.displayMedium }}>{a.name}</Text>
                  </Pressable>
                ) : null;
              })}
            </View>
          </View>
        </Card>
      ))}
      {feed.length > FEED_SHOWN ? <Button title={more ? "Show less" : "Show older news"} variant="ghost" small onPress={() => setMore((m) => !m)} /> : null}
    </View>
  );

  return (
    <View style={{ gap: space.m }}>
      {header}
      {columns > 1 ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.l }}>
          <View style={{ flex: 1, minWidth: 0 }}>{feedBlock}</View>
          <View style={{ flex: 1, minWidth: 0, gap: space.l }}>{tasksBlock}{homeworkBlock}</View>
        </View>
      ) : (
        <View style={{ gap: space.l }}>{tasksBlock}{homeworkBlock}{feedBlock}</View>
      )}
    </View>
  );
}
