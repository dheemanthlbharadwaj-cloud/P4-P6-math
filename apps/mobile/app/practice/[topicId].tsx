// Classroom "Practice (show answer)": browse a topic's pool questions (including the ones that cannot be auto-marked),
// reveal the answer, then self-mark. No hearts, energy, stars or wrong-bookmarks: pure practice.
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Grade } from "@p6/shared";
import { Body, Button, H1, ProgressBar, Screen } from "../../src/components/ui";
import { QuestionPanel } from "../../src/components/QuestionPanel";
import { CatCompanion } from "../../src/components/CatCompanion";
import { getPool, getTopic } from "../../src/content";
import { useQuestionOrientation } from "../../src/hooks/useQuestionOrientation";
import { colors, space } from "../../src/theme/colors";

const SHOWN: { correct: boolean; perPart: boolean[]; showAnswer: true } = { correct: true, perPart: [], showAnswer: true };

export default function Practice() {
  const router = useRouter();
  useQuestionOrientation();
  const { topicId, grade: g, selfMarkOnly } = useLocalSearchParams<{ topicId: string; grade: string; selfMarkOnly?: string }>();
  const grade = g as Grade;
  const topic = getTopic(grade, topicId);
  // Questions that need a human to mark them come first, then the rest of the pool.
  const questions = useMemo(() => {
    const pool = getPool(grade, { topicId });
    const manual = pool.filter((q) => !q.autoMarkable);
    return selfMarkOnly === "1" ? manual : [...manual, ...pool.filter((q) => q.autoMarkable)];
  }, [grade, topicId, selfMarkOnly]);

  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [right, setRight] = useState(0);
  const q = questions[i];

  const mark = (ok: boolean) => {
    if (ok) setRight((n) => n + 1);
    setI((n) => n + 1);
    setRevealed(false);
  };

  if (!q) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.l }}>
          <CatCompanion mood={questions.length && right === questions.length ? "correct" : "idle"} size={150} />
          <H1 style={{ marginTop: 12 }}>{questions.length ? "All done!" : "Nothing to practise here"}</H1>
          {questions.length ? <Text style={{ fontSize: 40, fontWeight: "900", color: colors.primary, marginVertical: 8 }}>{right} / {questions.length}</Text> : null}
          {questions.length ? <Body style={{ textAlign: "center", color: colors.inkSoft }}>That is how many you marked as right yourself.</Body> : null}
        </View>
        <View style={{ padding: space.l }}><Button title="Back to classroom" onPress={() => router.back()} /></View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.m, paddingVertical: space.s, gap: 10 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quit practice" style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: colors.ink }}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "900", color: colors.ink }} numberOfLines={1}>Practice · {topic?.name} · {i + 1}/{questions.length}</Text>
          <ProgressBar value={i / questions.length} />
        </View>
      </View>
      <QuestionPanel key={q.id} question={q} grade={grade} viewOnly reveal={revealed ? SHOWN : null} onSubmit={() => undefined} />
      <View style={{ flexDirection: "row", gap: 12, padding: space.l, borderTopWidth: 3, borderTopColor: colors.border, backgroundColor: colors.bg }}>
        {revealed ? (
          <>
            <Button title="I got it wrong" variant="ghost" onPress={() => mark(false)} style={{ flex: 1 }} />
            <Button title="I got it right" variant="good" onPress={() => mark(true)} style={{ flex: 1 }} />
          </>
        ) : (
          <>
            <Button title="Skip" variant="ghost" onPress={() => mark(false)} style={{ flex: 1 }} />
            <Button title="Show answer" variant="gold" onPress={() => setRevealed(true)} style={{ flex: 2 }} />
          </>
        )}
      </View>
    </Screen>
  );
}
