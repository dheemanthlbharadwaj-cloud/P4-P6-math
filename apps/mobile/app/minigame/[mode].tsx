// Mini games:
// - "challenge": 5-Minute Challenge. As many LV1 questions as you can in 5 minutes, with 5 hearts (a wrong answer
//   costs one). These hearts belong to the round only, not the player's map hearts.
// - "mistakes": Unlimited Mistakes. Only questions answered wrong before, no timer, no hearts; a right answer takes
//   the question's flag off. "all-wrong" is the same game over every question ever answered wrong.
// Stars (stars.ts): +1 for each question answered right that was never attempted before (levels or mini games), so
// re-attempts (every Unlimited Mistakes question, a question coming round again in the challenge) give none.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { CHALLENGE_HEARTS, CHALLENGE_SECONDS, markQuestion, starsForMinigameAnswer, type Grade, type MinigameResult, type Question } from "@p6/shared";
import { Body, Button, H1, ProgressBar, Screen } from "../../src/components/ui";
import { Stat } from "../../src/components/TopBar";
import { uiAssets } from "../../src/theme/assets";
import { QuestionPanel, type Reveal } from "../../src/components/QuestionPanel";
import { CatCompanion } from "../../src/components/CatCompanion";
import { useLeaveConfirm } from "../../src/components/LeaveConfirm";
import { getAllLv1, getQuestion } from "../../src/content";
import { useWrong } from "../../src/store/wrong";
import { useStars } from "../../src/store/stars";
import { useOfflineQueue } from "../../src/store/queue";
import { flushOfflineQueue } from "../../src/services/sync";
import { useNow } from "../../src/hooks/useNow";
import type { CatMood } from "../../src/theme/cats";
import { useQuestionOrientation } from "../../src/hooks/useQuestionOrientation";
import { colors, fonts, space } from "../../src/theme/colors";

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
  useQuestionOrientation();
  const dim = useWindowDimensions();
  const landscape = dim.width > dim.height;
  const { mode, grade: g, topicId } = useLocalSearchParams<{ mode: string; grade: string; topicId?: string }>();
  const grade = g as Grade;
  const timed = mode === "challenge";

  const questions = useMemo<Question[]>(() => {
    if (timed) return shuffle(getAllLv1(grade, topicId).filter((q) => q.autoMarkable));
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
  const [deadline] = useState(() => Date.now() + CHALLENGE_SECONDS * 1000);
  const [hearts, setHearts] = useState(CHALLENGE_HEARTS);
  const [tries, setTries] = useState(0); // questions answered (challenge)
  const [over, setOver] = useState<null | "time" | "hearts">(null);
  const now = useNow(250);

  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const q = over ? undefined : questions.find((x) => x.id === queue[0]);
  const wrongIds = useRef<Set<string>>(new Set());
  const [stars, setStars] = useState(0);
  const roundAnswers = useRef<MinigameResult["answers"]>([]);
  const sent = useRef(false);

  const finishQuestion = (correct: boolean, msg: string | null) => {
    if (!q) return;
    setTries((t) => t + 1);
    const st = useStars.getState();
    const star = starsForMinigameAnswer(correct, st.wasAttempted(grade, q.id));
    st.markAttempted(grade, q.id);
    roundAnswers.current.push({ questionId: q.id, correct });
    if (star) { st.award(star); setStars((n) => n + star); msg = `${msg ?? ""} +1 star`.trim(); }
    if (correct) {
      setScore((s) => s + 1);
      if (!timed && useWrong.getState().byGrade[grade]?.[q.id]) { useWrong.getState().remove(grade, q.id); msg = "Flag removed. Nice!"; }
    } else {
      useWrong.getState().add(grade, q.id);
      wrongIds.current.add(q.id);
      if (timed) setHearts((h) => h - 1);
    }
    setNote(msg);
    setMood(correct ? "correct" : "wrong");
  };

  // The 5 minutes run out: the round ends straight away (the question on screen doesn't count).
  useEffect(() => {
    if (timed && !over && remaining === 0) setOver("time");
  }, [remaining, timed, over]);

  const submit = (responses: string[]) => {
    if (!q) return;
    const r = markQuestion(q, responses);
    setReveal({ correct: r.correct, perPart: r.perPart, showAnswer: true });
    finishQuestion(r.correct, r.correct ? "Correct!" : "Not quite.");
  };

  const advance = () => {
    if (timed && hearts <= 0) { setOver("hearts"); return; }
    // Challenge: questions go to the back of the line, so the round never runs dry before the 5 minutes are up.
    setQueue((qs) => (timed ? [...qs.slice(1), qs[0]] : qs.slice(1)));
    setReveal(null); setNote(null); setMood("thinking");
  };
  const skip = () => {
    setQueue((qs) => (qs.length > 1 ? [...qs.slice(1), qs[0]] : qs));
  };

  const leaveConfirm = useLeaveConfirm({
    enabled: !!q,
    title: "Quit this round?",
    body: timed ? "Your score for this round will be lost." : "Questions you already got right stay unflagged.",
    fallback: "/(tabs)/classroom",
  });

  // Report the round to the server once (best effort; the stars are already credited on this device): when it is
  // over, or when the student leaves early, so stars earned before quitting are not lost on the next sync.
  const sendRound = useRef(() => {});
  sendRound.current = () => {
    if (sent.current || !roundAnswers.current.length) return;
    sent.current = true;
    const result: MinigameResult = { attemptId: Crypto.randomUUID(), grade, mode: timed ? "challenge" : mode === "all-wrong" ? "all-wrong" : "mistakes", answers: roundAnswers.current, finishedAt: Date.now() };
    useOfflineQueue.getState().enqueue({ ...result, kind: "minigame" });
    void flushOfflineQueue();
  };
  useEffect(() => { if (!q) sendRound.current(); }, [q]);
  useEffect(() => () => sendRound.current(), []);

  const title = timed ? "5-Minute Challenge" : mode === "all-wrong" ? "Unlimited Mistakes · all ever" : "Unlimited Mistakes";

  if (!q) {
    const heading = total === 0 ? "Nothing to practise" : over === "time" ? "Time's up!" : over === "hearts" ? "Out of hearts!" : "Round finished!";
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.l }}>
          <CatCompanion mood={timed ? (score >= 10 ? "correct" : "idle") : total && score === total ? "correct" : "idle"} size={150} />
          <H1 style={{ marginTop: 12 }}>{heading}</H1>
          {total > 0 ? (
            <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: 6 }} accessibilityLabel={`${stars} stars earned`}>
              {stars ? `+${stars} star${stars === 1 ? "" : "s"} earned` : timed ? "No new stars this round" : "No stars: these are questions you tried before"}
            </Text>
          ) : null}
          {timed ? (
            <>
              <Text style={{ fontSize: 40, fontFamily: fonts.display, color: colors.primary, marginVertical: 8 }}>{score} solved</Text>
              <Body style={{ textAlign: "center", color: colors.inkSoft }}>{tries} answered in {Math.round((CHALLENGE_SECONDS - remaining) / 6) / 10} min. Wrong ones are saved for Unlimited Mistakes.</Body>
            </>
          ) : total > 0 ? (
            <>
              <Text style={{ fontSize: 40, fontFamily: fonts.display, color: colors.primary, marginVertical: 8 }}>{score} / {total}</Text>
              <Body style={{ textAlign: "center", color: colors.inkSoft }}>Questions you got right are no longer flagged.</Body>
            </>
          ) : (
            <Body style={{ textAlign: "center", color: colors.inkSoft }}>No mistakes saved yet. Questions you get wrong will appear here.</Body>
          )}
        </View>
        <View style={{ padding: space.l }}><Button title="Back to classroom" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/classroom"))} /></View>
      </Screen>
    );
  }

  const answered = total - queue.length;
  return (
    <Screen edges={["top", "bottom"]}>
      {leaveConfirm.modal}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.m, paddingVertical: space.s, gap: 10 }}>
        <Pressable onPress={leaveConfirm.ask} accessibilityRole="button" accessibilityLabel="Quit" style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink }}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.display, color: colors.ink }}>{timed ? `${title} · ${score} solved` : `${title} · ${answered + 1}/${total}`}</Text>
          {timed ? <ProgressBar value={remaining / CHALLENGE_SECONDS} /> : <ProgressBar value={answered / total} />}
        </View>
        {timed ? (
          <>
            <Stat icon={uiAssets.icons.heart as number} text={String(hearts)} />
            <View style={{ minWidth: 70, minHeight: 44, borderRadius: 16, borderWidth: 3, borderColor: colors.border, backgroundColor: remaining <= 30 ? colors.badBg : colors.card, alignItems: "center", justifyContent: "center" }} accessibilityLabel={`${remaining} seconds left`}>
              <Text style={{ fontFamily: fonts.display, fontSize: 18, color: remaining <= 30 ? colors.bad : colors.ink }}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</Text>
            </View>
          </>
        ) : null}
      </View>
      <QuestionPanel reportContext="minigame" key={q.id} question={q} grade={grade} reveal={reveal} companion={<CatCompanion floating mood={mood} size={150} message={note ?? undefined} timerStartedAt={deadline - CHALLENGE_SECONDS * 1000} />} onSubmit={submit} onSkip={skip} canSkip={queue.length > 1} />
      {reveal ? (
        <View style={{ padding: space.l, backgroundColor: reveal.correct ? colors.goodBg : colors.badBg, borderTopWidth: 3, borderTopColor: colors.border }}>
          {landscape && note ? <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginBottom: 6 }}>{note}</Text> : null}
          <Button title={timed ? (hearts <= 0 ? "See score" : "Next") : queue.length === 1 ? "Finish" : "Next"} variant={reveal.correct ? "good" : "primary"} onPress={advance} />
        </View>
      ) : null}
    </Screen>
  );
}
