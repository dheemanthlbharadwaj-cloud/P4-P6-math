import React, { useMemo, useState } from "react";
import { catPoses } from "../../src/theme/cats";
import { Image, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { CHALLENGE_HEARTS, CHALLENGE_SECONDS } from "@p6/shared";
import { Body, Button, Card, Chip, Columns, H1, H2, Screen } from "../../src/components/ui";
import { getAllLv1, getPool, getTopics } from "../../src/content";
import { useProfile } from "../../src/store/profile";
import { useWrong } from "../../src/store/wrong";
import { colors, fonts, space } from "../../src/theme/colors";
import { useLayout } from "../../src/theme/layout";

export default function ClassroomTab() {
  const router = useRouter();
  const { wide, columns } = useLayout();
  const grade = useProfile((s) => s.grade);
  const topics = useMemo(() => getTopics(grade), [grade]);
  const [topicId, setTopicId] = useState<string | undefined>(undefined);
  const flagged = useWrong((s) => Object.keys(s.byGrade[grade] ?? {}).length);
  const ever = useWrong((s) => (s.history[grade] ?? []).length);
  const lv1Count = useMemo(() => getAllLv1(grade, topicId).length, [grade, topicId]);

  const [practiceTopic, setPracticeTopic] = useState<string | undefined>(undefined);
  const practiceId = practiceTopic ?? topics[0]?.id;
  const practiceCount = useMemo(
    () => (practiceId ? getPool(grade, { topicId: practiceId }).length : 0),
    [grade, practiceId],
  );
  const startPractice = () =>
    router.push({ pathname: "/practice/[topicId]", params: { topicId: practiceId as string, grade } });

  const go = (mode: "challenge" | "mistakes" | "all-wrong") =>
    router.push({ pathname: "/minigame/[mode]", params: { mode, grade, ...(topicId && mode === "challenge" ? { topicId } : {}) } });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: wide ? space.xl : space.l, gap: space.l }}>
        <H1>Classroom</H1>
        <Body style={{ color: colors.inkSoft, marginTop: -8 }}>Mini games and practice. No map hearts or energy needed.</Body>

        <Columns columns={columns}>
        <View style={{ gap: space.l }}>
        <H2>Mini games</H2>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source={catPoses.chasing} style={{ width: 64, height: 60 }} resizeMode="contain" />
            <H2 style={{ flex: 1 }}>5-Minute Challenge</H2>
          </View>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>
            Solve as many LV1 questions as you can in {CHALLENGE_SECONDS / 60} minutes. You have {CHALLENGE_HEARTS} hearts: each mistake costs one.
          </Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
            <Chip label="All topics" selected={!topicId} onPress={() => setTopicId(undefined)} />
            {topics.map((t) => <Chip key={t.id} label={t.name} selected={topicId === t.id} onPress={() => setTopicId(t.id)} />)}
          </View>
          <Text style={{ color: colors.inkSoft, fontWeight: "700", marginBottom: 8 }}>{lv1Count} questions available</Text>
          <Button title="Start the challenge" variant="gold" onPress={() => go("challenge")} disabled={lv1Count === 0} />
        </Card>
        </View>

        <View style={{ gap: space.l }}>
        {/* Side by side, every column starts with a heading so the cards line up. */}
        {columns > 1 ? <H2>Fix your mistakes</H2> : null}
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source={catPoses.confused} style={{ width: 64, height: 60 }} resizeMode="contain" />
            <H2 style={{ flex: 1 }}>Unlimited Mistakes</H2>
          </View>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>Only questions you got wrong before. No timer, no hearts. Get one right to take its flag off.</Body>
          <Text style={{ fontFamily: fonts.display, fontSize: 18, color: flagged ? colors.bad : colors.good, marginBottom: 8 }}>{flagged} to fix</Text>
          <Button title="Play Unlimited Mistakes" onPress={() => go("mistakes")} disabled={flagged === 0} />
          <Button title={`Test all wrong ever (${ever})`} variant="ghost" onPress={() => go("all-wrong")} disabled={ever === 0} style={{ marginTop: 10 }} />
        </Card>
        </View>

        <View style={{ gap: space.l }}>
        <H2 style={{ marginTop: columns > 1 ? 0 : 4 }}>Practice</H2>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image source={catPoses.cup} style={{ width: 64, height: 60 }} resizeMode="contain" />
            <H2 style={{ flex: 1 }}>Practice (show answer)</H2>
          </View>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>
            Pick a topic, read the question, then reveal the answer and mark yourself. Includes drawing and explain-why questions. No hearts, no stars.
          </Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
            {topics.map((t) => <Chip key={t.id} label={t.name} selected={practiceId === t.id} onPress={() => setPracticeTopic(t.id)} />)}
          </View>
          <Text style={{ color: colors.inkSoft, fontWeight: "700", marginBottom: 8 }}>{practiceCount} questions</Text>
          <Button title="Start practice" onPress={startPractice} disabled={practiceCount === 0} />
        </Card>
        </View>
        </Columns>

      </ScrollView>
    </Screen>
  );
}
