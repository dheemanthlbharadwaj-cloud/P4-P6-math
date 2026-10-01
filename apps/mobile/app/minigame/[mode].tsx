// Mini games: timed all-LV1 ("timed"), previously wrong ("wrong", unflag on correct), all wrong ever ("all-wrong").
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { markQuestion, TIMED_GAME_SECONDS_PER_QUESTION, type Grade, type Question } from "@p6/shared";
import { Body, Button, H1, ProgressBar, Screen } from "../../src/components/ui";
import { QuestionPanel, type Reveal } from "../../src/components/QuestionPanel";
import { CatCompanion } from "../../src/components/CatCompanion";
import { getAllLv1, getQuestion } from "../../src/content";
import { useWrong } from "../../src/store/wrong";
import { useNow } from "../../src/hooks/useNow";
import type { CatMood } from "../../src/theme/cats";
import { colors, space } from "../../src/theme/colors";

const ROUND_SIZE = 20; // ASSUMPTION: a timed round is 20 random LV1 questions (spec says "all LV1, timed")

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export default function MiniGame() {
  const router = useRouter();
  const { mode, grade: g, topicId } = useLocalSearchParams<{ mode: string; grade: string; topicId?: string }>();
  const grade = g as Grade;
  const timed = mode === "timed";

  const questions = useMemo<Question[]>(() => {
    if (timed) return shuffle(getAllLv1(grade, topicId)).slice(0, ROUND_SIZE);
    const w = useWrong.getState();
    const ids = mode === "all-wrong" ? w.historyIds(grade) : w.ids(grade);
    return shuffle(ids.map((id) => getQuestion(grade, id)).filter((q): q is Question => !!q && q.autoMarkable));
  }, [grade, mode, timed, topicId]);

  const [queue, setQueue] = useState<string[]>(() => questions.map((q) => q.id));
  const [total] = useState(questions.length);
  const [score, setScore] = useState(0);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mood, setMood] = useState<CatMood>("thinking");
  const [deadline, setDeadline] = useState(() => Date.now() + TIMED_GAME_SECONDS_PER_QUESTION * 1000);
  const now = useNow(250);

  const q = questions.find((x) => x.id === queue[0]);
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const wrongIds = useRef<Set<string>>(new Set());

  const finishQuestion = (correct: boolean, msg: string | null) => {
    if (!q) return;
    if (correct) {
      setScore((s) => s + 1);
      if (!timed && useWrong.getState().byGrade[grade]?.[q.id]) { useWrong.getState().remove(grade, q.id); msg = "Flag removed. Nice!"; }
    } else {
      useWrong.getState().add(grade, q.id);
      wrongIds.current.add(q.id);
    }
    setNote(msg);
    setMood(correct ? "correct" : "wrong");
  };

  // Per-question timeout (timed mode only).
  useEffect(() => {
    if (timed && q && !reveal && remaining === 0) {
      setReveal({ correct: false, perPart: (q.parts ?? [null]).map(() => false), showAnswer: true });
      finishQuestion(false, "Time's up!");
    }
  }, [remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (responses: string[]) => {
    if (!q) return;
    const r = markQuestion(q, responses);
    setReveal({ correct: r.correct, perPart: r.perPart, showAnswer: true });
    finishQuestion(r.correct, r.correct ? "Correct!" : "Not quite.");
  };

  const advance = () => {
    setQueue((qs) => qs.slice(1));
    setReveal(null); setNote(null); setMood("thinking");
    setDeadline(Date.now() + TIMED_GAME_SECONDS_PER_QUESTION * 1000);
  };
  const skip = () => {
    setQueue((qs) => (qs.length > 1 ? [...qs.slice(1), qs[0]] : qs));
    setDeadline(Date.now() + TIMED_GAME_SECONDS_PER_QUESTION * 1000);
  };

  const title = timed ? "Beat the clock" : mode === "all-wrong" ? "All wrong ever" : "Previously wrong";

  if (!q) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.l }}>
          <CatCompanion mood={total && score === total ? "correct" : "idle"} size={150} />
          <H1 style={{ marginTop: 12 }}>{total === 0 ? "Nothing to practise" : "Round finished!"}</H1>
          {total > 0 ? <Text style={{ fontSize: 40, fontWeight: "900", color: colors.primary, marginVertical: 8 }}>{score} / {total}</Text> : null}
          {!timed && total > 0 ? <Body style={{ textAlign: "center", color: colors.inkSoft }}>Questions you got right are no longer flagged.</Body> : null}
        </View>
        <View style={{ padding: space.l }}><Button title="Back to classroom" onPress={() => router.back()} /></View>
      </Screen>
    );
  }

  const answered = total - queue.length;
  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.m, paddingVertical: space.s, gap: 10 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quit" style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: colors.ink }}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "900", color: colors.ink }}>{title} · {answered + 1}/{total}</Text>
          <ProgressBar value={answered / total} />
        </View>
        {timed ? (
          <View style={{ minWidth: 64, minHeight: 44, borderRadius: 16, borderWidth: 3, borderColor: colors.border, backgroundColor: remaining <= 10 ? colors.badBg : colors.card, alignItems: "center", justifyContent: "center" }} accessibilityLabel={`${remaining} seconds left`}>
            <Text style={{ fontWeight: "900", fontSize: 20, color: remaining <= 10 ? colors.bad : colors.ink }}>{remaining}s</Text>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", paddingHorizontal: space.l }}>
        <CatCompanion mood={mood} size={76} message={note ?? undefined} />
      </View>
      <QuestionPanel key={q.id} question={q} grade={grade} reveal={reveal} onSubmit={submit} onSkip={skip} canSkip={queue.length > 1} />
      {reveal ? (
        <View style={{ padding: space.l, backgroundColor: reveal.correct ? colors.goodBg : colors.badBg, borderTopWidth: 3, borderTopColor: colors.border }}>
          <Button title={queue.length === 1 ? "Finish" : "Next"} variant={reveal.correct ? "good" : "primary"} onPress={advance} />
        </View>
      ) : null}
    </Screen>
  );
}
