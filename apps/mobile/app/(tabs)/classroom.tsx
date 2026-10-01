import React, { useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { TIMED_GAME_SECONDS_PER_QUESTION } from "@p6/shared";
import { Body, Button, Card, Chip, H1, H2, Screen } from "../../src/components/ui";
import { getAllLv1, getTopics } from "../../src/content";
import { useProfile } from "../../src/store/profile";
import { useWrong } from "../../src/store/wrong";
import { colors, space } from "../../src/theme/colors";

export default function ClassroomTab() {
  const router = useRouter();
  const grade = useProfile((s) => s.grade);
  const topics = useMemo(() => getTopics(grade), [grade]);
  const [topicId, setTopicId] = useState<string | undefined>(undefined);
  const flagged = useWrong((s) => Object.keys(s.byGrade[grade] ?? {}).length);
  const ever = useWrong((s) => (s.history[grade] ?? []).length);
  const lv1Count = useMemo(() => getAllLv1(grade, topicId).length, [grade, topicId]);

  const go = (mode: "timed" | "wrong" | "all-wrong") =>
    router.push({ pathname: "/minigame/[mode]", params: { mode, grade, ...(topicId && mode === "timed" ? { topicId } : {}) } });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.l }}>
        <H1>Classroom</H1>
        <Body style={{ color: colors.inkSoft, marginTop: -8 }}>Mini games. No hearts or energy needed.</Body>

        <Card>
          <H2>Beat the clock</H2>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>
            LV1 questions, {TIMED_GAME_SECONDS_PER_QUESTION} seconds each. Practice only, no stars.
          </Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
            <Chip label="All topics" selected={!topicId} onPress={() => setTopicId(undefined)} />
            {topics.map((t) => <Chip key={t.id} label={t.name} selected={topicId === t.id} onPress={() => setTopicId(t.id)} />)}
          </View>
          <Text style={{ color: colors.inkSoft, fontWeight: "700", marginBottom: 8 }}>{lv1Count} questions available</Text>
          <Button title="Start timed game" variant="gold" onPress={() => go("timed")} disabled={lv1Count === 0} />
        </Card>

        <Card>
          <H2>Previously wrong</H2>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>Untimed. Get one right to take its flag off.</Body>
          <Text style={{ fontWeight: "900", fontSize: 18, color: flagged ? colors.bad : colors.good, marginBottom: 8 }}>{flagged} flagged</Text>
          <Button title="Practise flagged questions" onPress={() => go("wrong")} disabled={flagged === 0} />
          <Button title={`Test all wrong ever (${ever})`} variant="ghost" onPress={() => go("all-wrong")} disabled={ever === 0} style={{ marginTop: 10 }} />
        </Card>
      </ScrollView>
    </Screen>
  );
}
