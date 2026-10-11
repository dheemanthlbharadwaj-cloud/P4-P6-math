// Level / question screen: the level's questions without a star yet (all 5 once the level is complete), each answered
// once (a wrong answer costs a heart and moves on); progress bar, cat companion, hearts, skip, calculator, pictures.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { levelKey, levelQuestionsToPlay, markQuestion, MAX_HEARTS, type Grade, type LevelNo, type LevelResult } from "@p6/shared";
import { Body, Button, H1, H2, ProgressBar, Screen } from "../../../../src/components/ui";
import { LevelStars } from "../../../../src/components/LevelStars";
import { QuestionPanel, type Reveal } from "../../../../src/components/QuestionPanel";
import { CatCompanion } from "../../../../src/components/CatCompanion";
import { ResourceModal } from "../../../../src/components/ResourceModal";
import { useLeaveConfirm } from "../../../../src/components/LeaveConfirm";
import { Stat } from "../../../../src/components/TopBar";
import { getContentVersion, getLevelQuestions, getSubtopic } from "../../../../src/content";
import { advance, correctIds, currentId, isDone, progressFraction, recordAnswer, skip, startSession, toAnswers, type SessionState } from "../../../../src/logic/levelSession";
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

  const levelQuestions = useMemo(() => getLevelQuestions(grade, subtopicId, level), [grade, subtopicId, level]);
  const levelIds = useMemo(() => levelQuestions.map((q) => q.id), [levelQuestions]);
  const info = getSubtopic(grade, subtopicId);
  // Decided once when the level opens: the questions that already have their star, and whether the level is complete
  // (then this is a replay of all 5, which can pay the one-off bonus star).
  const [before] = useState(() => {
    const l = useProgress.getState().grades[grade]?.levels[levelKey(subtopicId, level)];
    return { correct: l?.completed ? levelIds : (l?.correctIds ?? []).filter((id) => levelIds.includes(id)), complete: !!l?.completed };
  });
  const [playIds] = useState(() => levelQuestionsToPlay(levelIds, before.correct));
  const questions = useMemo(() => playIds.map((id) => levelQuestions.find((q) => q.id === id)!).filter(Boolean), [playIds, levelQuestions]);
  const [session, setSession] = useState<SessionState>(() => startSession(playIds));
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now()); // the cat's board: a 5-minute clock, restarted for every question
  const [gate, setGate] = useState(false);
  const [phase, setPhase] = useState<"playing" | "complete" | "gaveup">("playing");
  const [mood, setMood] = useState<CatMood>("thinking");
  const saved = useRef(false);
  const meters = useMeters();
  // Stars (stars.ts): +1 for each question answered right that didn't have its star yet; a replay of a complete level
  // with all 5 right pays one bonus star, once per level. The server marks the answers again and its balances win.
  const [earned, setEarned] = useState(0);
  const [bonus, setBonus] = useState(false);
  const [gain, setGain] = useState(0); // stars from the answer on screen
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const earnStars = (n: number) => {
    if (n <= 0) return;
    useStars.getState().award(n);
    setEarned((e) => e + n);
  };

  const curId = currentId(session);
  const question = questions.find((q) => q.id === curId);

  const save = (completed: boolean, s: SessionState) => {
    if (saved.current) return;
    saved.current = true;
    useProgress.getState().recordLevel(grade, subtopicId, level, correctIds(s), levelIds);
    // Every attempt with an answer goes to the server (stars count even when the attempt isn't finished).
    const answers = toAnswers(s);
    if (answers.length) {
      const result: LevelResult = {
        attemptId: Crypto.randomUUID(), grade, contentVersion: getContentVersion(grade), subtopicId, level,
        answers, completed, finishedAt: Date.now(),
      };
      useOfflineQueue.getState().enqueue(result);
      void flushOfflineQueue(); // no-op/queued when offline
    }
  };
  // Leaving mid-level still reports the answers given (their stars were already credited).
  useEffect(() => () => { if (!saved.current && toAnswers(sessionRef.current).length) save(false, sessionRef.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (responses: string[]) => {
    if (!question) return;
    const r = markQuestion(question, responses);
    setReveal({ correct: r.correct, perPart: r.perPart });
    // Into the session now, not on Continue: leaving straight after answering must still send the answer (and its star).
    setSession((s) => recordAnswer(s, responses, r.correct));
    useStars.getState().markAttempted(grade, question.id);
    const st = r.correct && !before.correct.includes(question.id) ? 1 : 0;
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
    const s = advance(session);
    setSession(s);
    setReveal(null);
    setGain(0);
    setMood("thinking");
    setStartedAt(Date.now());
    if (isDone(s)) {
      // Replay of a complete level with all 5 right: the one-off bonus star.
      if (before.complete && correctIds(s).length === levelIds.length && !useStars.getState().bonusClaimed(grade, subtopicId, level)) {
        useStars.getState().markBonus(grade, subtopicId, level);
        earnStars(1);
        setBonus(true);
      }
      save(true, s);
      setPhase("complete");
    }
  };

  const doSkip = () => { setSession((s) => skip(s)); setMood("thinking"); setStartedAt(Date.now()); };
  const giveUp = () => { setGate(false); save(false, session); setPhase("gaveup"); };

  const [needEnergy, setNeedEnergy] = useState(false);
  const leaveConfirm = useLeaveConfirm({
    enabled: phase === "playing",
    title: "Leave this level?",
    body: "Questions you answered right keep their stars; the others will be waiting next time. The energy you already spent is not refunded.",
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

  if (!levelQuestions.length) {
    return (
      <Screen><View style={{ padding: space.l }}><H2>No questions here yet</H2><Button title="Back" onPress={goMap} style={{ marginTop: 12 }} /></View></Screen>
    );
  }

  if (phase !== "playing") {
    // Stars beside the level button now (what this device knows; the server confirms them when it gets the result).
    const after = useProgress.getState().grades[grade]?.levels[levelKey(subtopicId, level)];
    const starsNow = after?.completed ? levelIds.length : (after?.correctIds?.length ?? 0);
    const complete = !!after?.completed;
    const missing = levelIds.length - starsNow;
    const justCompleted = complete && !before.complete;
    const title = justCompleted ? "Level complete!" : complete ? (bonus ? "Bonus star!" : "Great practice!") : phase === "gaveup" ? "Good try!" : "Nice work!";
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={{ flex: 1, padding: space.l, alignItems: "center", justifyContent: "center" }}>
          <CatCompanion mood={complete || earned ? "correct" : "sad"} size={160} />
          <H1 style={{ marginTop: 12, textAlign: "center" }}>{title}</H1>
          <Body style={{ color: colors.inkSoft, textAlign: "center", marginTop: 4 }}>{info?.subtopic.name} · Level {level}</Body>
          <LevelStars filled={starsNow} total={levelIds.length} size={40} style={{ marginTop: 16 }} />
          <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: 8, textAlign: "center" }}>
            {earned ? `+${earned} ${earned === 1 ? "star" : "stars"}${bonus ? " (bonus for getting all 5 right again)" : ""}` : "No new stars this time"}
          </Text>
          {justCompleted ? (
            <>
              <Image source={uiAssets.node.gold} style={{ width: 88, height: 88, marginTop: 14 }} />
              <Text style={{ fontWeight: "800", color: colors.inkSoft, marginTop: 6 }}>Your level button is now a star!</Text>
            </>
          ) : !complete ? (
            <Body style={{ textAlign: "center", marginVertical: 12, color: colors.inkSoft }}>
              {phase === "gaveup" ? "You ran out of hearts. " : ""}
              {missing === 1 ? "1 question is waiting for you next time." : `${missing} questions are waiting for you next time.`}
            </Body>
          ) : null}
        </View>
        <View style={{ padding: space.l, gap: 10 }}>
          {complete && nextNode ? <Button title="Next level" variant="good" onPress={startNext} /> : null}
          <Button title="Back to map" variant={complete && nextNode ? "ghost" : "primary"} onPress={goMap} />
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
                {reveal.correct ? (gain ? "Correct! +1 star" : "Correct!") : "Not quite. -1 heart. Try it again next time."}
              </Text>
              <Button title={isDone(advance(session)) ? "Finish" : "Continue"} variant={reveal.correct ? "good" : "primary"} onPress={next} disabled={gate} />
            </View>
          ) : null}
        </View>
      ) : null}

      {leaveConfirm.modal}
      <ResourceModal kind="hearts" visible={gate} onRewarded={() => { setGate(false); setMood("wrong"); }} onGiveUp={giveUp} />
    </Screen>
  );
}
