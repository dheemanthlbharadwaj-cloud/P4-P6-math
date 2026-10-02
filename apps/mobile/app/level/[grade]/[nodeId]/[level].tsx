// Level / question screen: 5 questions, progress bar, cat companion, hearts, skip, calculator, picture viewer.
import React, { useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { markQuestion, STARS_PER_LEVEL, MAX_HEARTS, type Grade, type LevelNo, type LevelResult } from "@p6/shared";
import { Body, Button, H1, H2, ProgressBar, Screen } from "../../../../src/components/ui";
import { QuestionPanel, type Reveal } from "../../../../src/components/QuestionPanel";
import { CatCompanion } from "../../../../src/components/CatCompanion";
import { ResourceModal } from "../../../../src/components/ResourceModal";
import { Stat } from "../../../../src/components/TopBar";
import { getContentVersion, getLevelQuestions, getSubtopic } from "../../../../src/content";
import { answer, correctCount, currentId, isDone, progressFraction, skip, startSession, toAnswers, type SessionState } from "../../../../src/logic/levelSession";
import { nextLevel } from "../../../../src/logic/unlock";
import { computeMeters, usePlayer } from "../../../../src/store/player";
import { useProgress } from "../../../../src/store/progress";
import { useWrong } from "../../../../src/store/wrong";
import { useOfflineQueue } from "../../../../src/store/queue";
import { useMeters } from "../../../../src/hooks/useNow";
import { flushOfflineQueue } from "../../../../src/services/sync";
import { uiAssets } from "../../../../src/theme/assets";
import type { CatMood } from "../../../../src/theme/cats";
import { useQuestionOrientation } from "../../../../src/hooks/useQuestionOrientation";
import { colors, space } from "../../../../src/theme/colors";

export default function LevelScreen() {
  const router = useRouter();
  useQuestionOrientation();
  const dim = useWindowDimensions();
  const landscape = dim.width > dim.height;
  const params = useLocalSearchParams<{ grade: string; nodeId: string; level: string }>();
  const grade = params.grade as Grade;
  const subtopicId = params.nodeId as string;
  const level = Number(params.level) as LevelNo;

  const questions = useMemo(() => getLevelQuestions(grade, subtopicId, level), [grade, subtopicId, level]);
  const ids = useMemo(() => questions.map((q) => q.id), [questions]);
  const info = getSubtopic(grade, subtopicId);
  const [session, setSession] = useState<SessionState>(() => startSession(ids));
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [gate, setGate] = useState(false);
  const [phase, setPhase] = useState<"playing" | "complete" | "gaveup">("playing");
  const [mood, setMood] = useState<CatMood>("thinking");
  const saved = useRef(false);
  const meters = useMeters();

  const curId = currentId(session);
  const question = questions.find((q) => q.id === curId);

  const save = (completed: boolean, s: SessionState) => {
    if (saved.current) return;
    saved.current = true;
    useProgress.getState().recordLevel(grade, subtopicId, level, correctCount(s), completed);
    if (completed) {
      const result: LevelResult = {
        attemptId: Crypto.randomUUID(), grade, contentVersion: getContentVersion(grade), subtopicId, level,
        answers: toAnswers(s, ids), completed: true, finishedAt: Date.now(),
      };
      useOfflineQueue.getState().enqueue(result);
      void flushOfflineQueue(); // no-op/queued when offline
    }
  };

  const submit = (responses: string[]) => {
    if (!question) return;
    const r = markQuestion(question, responses);
    setReveal({ correct: r.correct, perPart: r.perPart });
    if (r.correct) { setMood("correct"); return; }
    useWrong.getState().add(grade, question.id);
    usePlayer.getState().spendHeart();
    const p = usePlayer.getState();
    const left = computeMeters(p, Date.now());
    if (!left.subscribed && left.hearts <= 0) { setMood("sad"); setGate(true); } else setMood("wrong");
  };

  const next = () => {
    if (!reveal) return;
    const s = answer(session, reveal.correct);
    setSession(s);
    setReveal(null);
    setMood("thinking");
    if (isDone(s)) { save(true, s); setPhase("complete"); }
  };

  const doSkip = () => { setSession((s) => skip(s)); setMood("thinking"); };

  const giveUp = () => { setGate(false); save(false, session); setPhase("gaveup"); };

  const confirmLeave = () =>
    Alert.alert("Leave this level?", "Your progress in this attempt will be lost.", [
      { text: "Keep playing", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.back() },
    ]);

  const startNext = () => {
    const nl = nextLevel(level);
    if (!nl) return;
    if (!usePlayer.getState().spendEnergy()) { Alert.alert("Out of energy", "Watch an ad on the Profile tab or wait for energy to recover."); return; }
    router.replace({ pathname: "/level/[grade]/[nodeId]/[level]", params: { grade, nodeId: subtopicId, level: String(nl) } });
  };

  if (!questions.length) {
    return (
      <Screen><View style={{ padding: space.l }}><H2>No questions here yet</H2><Button title="Back" onPress={() => router.back()} style={{ marginTop: 12 }} /></View></Screen>
    );
  }

  if (phase !== "playing") {
    const won = phase === "complete";
    const stars = STARS_PER_LEVEL[level];
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={{ flex: 1, padding: space.l, alignItems: "center", justifyContent: "center" }}>
          <CatCompanion mood={won ? "correct" : "sad"} size={160} />
          <H1 style={{ marginTop: 12, textAlign: "center" }}>{won ? "Level complete!" : "Good try!"}</H1>
          <Body style={{ color: colors.inkSoft, textAlign: "center", marginTop: 4 }}>{info?.subtopic.name} · Level {level}</Body>
          {won ? (
            <>
              <View style={{ flexDirection: "row", marginVertical: 16, gap: 8 }} accessibilityLabel={`${stars} stars earned`}>
                {Array.from({ length: stars }, (_, i) => <Image key={i} source={uiAssets.icons.star} style={{ width: 56, height: 56 }} />)}
              </View>
              <Image source={uiAssets.level.gold} style={{ width: 96, height: 96 }} />
              <Text style={{ fontWeight: "800", color: colors.inkSoft, marginTop: 6 }}>Your level button is now gold!</Text>
            </>
          ) : (
            <Body style={{ textAlign: "center", marginVertical: 16 }}>You ran out of hearts. Rest up, then try again.</Body>
          )}
        </View>
        <View style={{ padding: space.l, gap: 10 }}>
          {won && nextLevel(level) ? <Button title={`Next: Level ${nextLevel(level)}`} variant="good" onPress={startNext} /> : null}
          <Button title="Back to map" variant={won && nextLevel(level) ? "ghost" : "primary"} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const message = reveal ? (reveal.correct ? "Yes! Great job!" : "Oops, not quite!") : undefined;

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.m, paddingVertical: space.s, gap: 10 }}>
        <Pressable onPress={confirmLeave} accessibilityRole="button" accessibilityLabel="Leave level" style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 26, fontWeight: "900", color: colors.ink }}>✕</Text>
        </Pressable>
        <ProgressBar value={progressFraction(session)} style={{ flex: 1 }} />
        <Stat icon={uiAssets.icons.heart as number} text={meters.subscribed ? "∞" : `${meters.hearts}/${MAX_HEARTS}`} />
      </View>
      {landscape ? null : (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space.l }}>
          <CatCompanion mood={mood} size={84} message={message} />
        </View>
      )}

      {question ? (
        <View style={{ flex: 1 }}>
          <QuestionPanel key={question.id} question={question} grade={grade} reveal={reveal} onSubmit={submit} onSkip={doSkip} canSkip={session.queue.length > 1} />
          {reveal ? (
            <View style={{ padding: space.l, backgroundColor: reveal.correct ? colors.goodBg : colors.badBg, borderTopWidth: 3, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 20, fontWeight: "900", color: reveal.correct ? colors.good : colors.bad, marginBottom: 8 }}>
                {reveal.correct ? "Correct!" : "Not quite. -1 heart. This question will come back."}
              </Text>
              <Button title={isDone(answer(session, reveal.correct)) ? "Finish" : "Continue"} variant={reveal.correct ? "good" : "primary"} onPress={next} disabled={gate} />
            </View>
          ) : null}
        </View>
      ) : null}

      <ResourceModal kind="hearts" visible={gate} onRewarded={() => { setGate(false); setMood("wrong"); }} onGiveUp={giveUp} />
    </Screen>
  );
}
