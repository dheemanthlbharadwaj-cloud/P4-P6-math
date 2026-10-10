// Level / question screen: 5 questions, progress bar, cat companion, hearts, skip, calculator, picture viewer.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { markQuestion, MAX_HEARTS, starsForLevelAnswer, starsForLevelCompletion, type Grade, type LevelNo, type LevelResult } from "@p6/shared";
import { Body, Button, H1, H2, ProgressBar, Screen } from "../../../../src/components/ui";
import { QuestionPanel, type Reveal } from "../../../../src/components/QuestionPanel";
import { CatCompanion } from "../../../../src/components/CatCompanion";
import { ResourceModal } from "../../../../src/components/ResourceModal";
import { useLeaveConfirm } from "../../../../src/components/LeaveConfirm";
import { Stat } from "../../../../src/components/TopBar";
import { getContentVersion, getLevelQuestions, getSubtopic } from "../../../../src/content";
import { answer, recordAnswer, correctCount, currentId, isDone, isFirstTry, progressFraction, skip, startSession, toAnswers, type SessionState } from "../../../../src/logic/levelSession";
import { nextMapLevel } from "../../../../src/logic/unlock";
import { computeMeters, usePlayer } from "../../../../src/store/player";
import { useProgress } from "../../../../src/store/progress";
import { useWrong } from "../../../../src/store/wrong";
import { useOfflineQueue } from "../../../../src/store/queue";
import { useStars } from "../../../../src/store/stars";
import { useMeters } from "../../../../src/hooks/useNow";
import { flushOfflineQueue } from "../../../../src/services/sync";
import { uiAssets } from "../../../../src/theme/assets";
import type { CatMood } from "../../../../src/theme/cats";
import { useQuestionOrientation } from "../../../../src/hooks/useQuestionOrientation";
import { colors, fonts, space } from "../../../../src/theme/colors";

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
  const [startedAt, setStartedAt] = useState(() => Date.now()); // the cat's board: a 5-minute clock, restarted for every question
  const [gate, setGate] = useState(false);
  const [phase, setPhase] = useState<"playing" | "complete" | "gaveup">("playing");
  const [mood, setMood] = useState<CatMood>("thinking");
  const saved = useRef(false);
  const meters = useMeters();
  // Stars (stars.ts): a level that never gave a star pays +1 per question right on the first try; a re-attempt pays
  // +1 on completion. Decided once per attempt, so earning the first star mid-attempt doesn't change the rules.
  const [starredBefore] = useState(() => useStars.getState().isLevelStarred(grade, subtopicId, level));
  const [earned, setEarned] = useState(0);
  const [gain, setGain] = useState(0); // stars from the answer on screen
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const earnStars = (n: number) => {
    if (n <= 0) return;
    useStars.getState().award(n);
    useStars.getState().markLevelStarred(grade, subtopicId, level);
    setEarned((e) => e + n);
  };

  const curId = currentId(session);
  const question = questions.find((q) => q.id === curId);

  const save = (completed: boolean, s: SessionState) => {
    if (saved.current) return;
    saved.current = true;
    useProgress.getState().recordLevel(grade, subtopicId, level, correctCount(s), completed);
    // Every attempt with an answer goes to the server (first-time stars count even when the level isn't finished).
    if (completed || Object.keys(s.firstTry).length) {
      const result: LevelResult = {
        attemptId: Crypto.randomUUID(), grade, contentVersion: getContentVersion(grade), subtopicId, level,
        answers: toAnswers(s, ids), completed, finishedAt: Date.now(),
      };
      useOfflineQueue.getState().enqueue(result);
      void flushOfflineQueue(); // no-op/queued when offline
    }
  };
  // Leaving mid-level still reports the answers given (their stars were already credited).
  useEffect(() => () => { if (!saved.current && Object.keys(sessionRef.current.firstTry).length) save(false, sessionRef.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (responses: string[]) => {
    if (!question) return;
    const r = markQuestion(question, responses);
    setReveal({ correct: r.correct, perPart: r.perPart });
    const st = starsForLevelAnswer(r.correct, isFirstTry(session, question.id), starredBefore);
    // Into the session now, not on Continue: leaving straight after answering must still send the answer (and its star).
    setSession((s) => recordAnswer(s, r.correct));
    useStars.getState().markAttempted(grade, question.id);
    earnStars(st);
    setGain(st);
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
    setGain(0);
    setMood("thinking");
    setStartedAt(Date.now());
    if (isDone(s)) { earnStars(starsForLevelCompletion(true, starredBefore)); save(true, s); setPhase("complete"); }
  };

  const doSkip = () => { setSession((s) => skip(s)); setMood("thinking"); setStartedAt(Date.now()); };
  const giveUp = () => { setGate(false); save(false, session); setPhase("gaveup"); };

  const [needEnergy, setNeedEnergy] = useState(false);
  const leaveConfirm = useLeaveConfirm({
    enabled: phase === "playing",
    title: "Leave this level?",
    body: "Your progress in this attempt will be lost, and the energy you already spent is not refunded. Stars you already earned stay.",
  });
  const goMap = () => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/map"); };

  // The next button up the map (same rule as the map: Level N+1 only once every Level N on the map is done).
  const mapProgress = useProgress((s) => s.grades[grade]);
  const nextNode = info ? nextMapLevel(mapProgress, [...info.topic.subtopics].sort((a, b) => a.order - b.order).map((s) => s.id), subtopicId, level) : null;
  const startNext = () => {
    if (!nextNode) return;
    if (!usePlayer.getState().spendEnergy()) { setNeedEnergy(true); return; }
    router.replace({ pathname: "/level/[grade]/[nodeId]/[level]", params: { grade, nodeId: nextNode.subtopicId, level: String(nextNode.level) } });
  };

  if (!questions.length) {
    return (
      <Screen><View style={{ padding: space.l }}><H2>No questions here yet</H2><Button title="Back" onPress={goMap} style={{ marginTop: 12 }} /></View></Screen>
    );
  }

  if (phase !== "playing") {
    const won = phase === "complete";
    const stars = earned;
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={{ flex: 1, padding: space.l, alignItems: "center", justifyContent: "center" }}>
          <CatCompanion mood={won ? "correct" : "sad"} size={160} />
          <H1 style={{ marginTop: 12, textAlign: "center" }}>{won ? "Level complete!" : "Good try!"}</H1>
          <Body style={{ color: colors.inkSoft, textAlign: "center", marginTop: 4 }}>{info?.subtopic.name} · Level {level}</Body>
          {won ? (
            <>
              <View style={{ flexDirection: "row", marginTop: 16, gap: 8 }} accessibilityLabel={`${stars} stars earned`}>
                {Array.from({ length: stars }, (_, i) => <Image key={i} source={uiAssets.icons.star} style={{ width: 48, height: 48 }} />)}
              </View>
              <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: 6, marginBottom: 12, textAlign: "center" }}>
                {stars === 1 ? "1 star earned" : `${stars} stars earned`}{starredBefore ? " for finishing this level again" : ""}
              </Text>
              <Image source={uiAssets.level.gold} style={{ width: 96, height: 96 }} />
              <Text style={{ fontWeight: "800", color: colors.inkSoft, marginTop: 6 }}>Your level button is now gold!</Text>
            </>
          ) : (
            <Body style={{ textAlign: "center", marginVertical: 16 }}>You ran out of hearts. Rest up, then try again.{stars ? ` You still keep the ${stars === 1 ? "star" : `${stars} stars`} you earned.` : ""}</Body>
          )}
        </View>
        <View style={{ padding: space.l, gap: 10 }}>
          {won && nextNode ? <Button title="Next level" variant="good" onPress={startNext} /> : null}
          <Button title="Back to map" variant={won && nextNode ? "ghost" : "primary"} onPress={goMap} />
        </View>
        <ResourceModal kind="energy" visible={needEnergy} onRewarded={() => { setNeedEnergy(false); startNext(); }} onGiveUp={() => setNeedEnergy(false)} giveUpLabel="Not now" />
      </Screen>
    );
  }

  const message = reveal ? (reveal.correct ? (gain ? "Yes! Great job! +1 star" : "Yes! Great job!") : "Oops, not quite!") : undefined;

  return (
    <Screen edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.m, paddingVertical: space.s, gap: 10 }}>
        <Pressable onPress={leaveConfirm.ask} accessibilityRole="button" accessibilityLabel="Leave level" style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink }}>✕</Text>
        </Pressable>
        <ProgressBar value={progressFraction(session)} style={{ flex: 1 }} />
        {landscape ? <CatCompanion mood={mood} size={52} /> : null}
        <Stat icon={uiAssets.icons.heart as number} text={meters.subscribed ? "∞" : `${meters.hearts}/${MAX_HEARTS}`} />
      </View>
      {question ? (
        <View style={{ flex: 1 }}>
          <QuestionPanel reportContext="level" key={question.id} question={question} grade={grade} reveal={reveal} companion={<CatCompanion floating mood={mood} size={150} message={message} timerStartedAt={startedAt} />} onSubmit={submit} onSkip={doSkip} canSkip={session.queue.length > 1} />
          {reveal ? (
            <View style={{ padding: space.l, backgroundColor: reveal.correct ? colors.goodBg : colors.badBg, borderTopWidth: 3, borderTopColor: colors.border }}>
              <Text style={{ fontSize: 20, fontFamily: fonts.display, color: reveal.correct ? colors.good : colors.bad, marginBottom: 8 }}>
                {reveal.correct ? "Correct!" : "Not quite. -1 heart. This question will come back."}
              </Text>
              <Button title={isDone(answer(session, reveal.correct)) ? "Finish" : "Continue"} variant={reveal.correct ? "good" : "primary"} onPress={next} disabled={gate} />
            </View>
          ) : null}
        </View>
      ) : null}

      {leaveConfirm.modal}
      <ResourceModal kind="hearts" visible={gate} onRewarded={() => { setGate(false); setMood("wrong"); }} onGiveUp={giveUp} />
    </Screen>
  );
}
