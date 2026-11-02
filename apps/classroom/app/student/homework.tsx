// Homework: the questions the teacher marked wrong, with the game's Unlimited Mistakes rules (no timer, no hearts; a
// right answer is green and leaves the list, a wrong one is red and never shows the right answer). The round is
// reported like the game's ("mistakes" round), so the server drops the ones answered right.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { MinigameResult, Question } from "@p6/shared";
import { markQuestion } from "@p6/shared";
import { Body, Button, H1, ProgressBar } from "../../src/components/ui";
import { QuestionView, type Reveal } from "../../src/components/QuestionView";
import { getQuestion } from "../../src/content";
import { homeworkIds } from "../../src/logic/classroom";
import { STUDENT_GRADE, accountKey, refreshClassroom, reportHomeworkRound } from "../../src/student/service";
import { emptyAccount, useClassroom } from "../../src/student/store";
import { StudentTopBar } from "../../src/student/Shell";
import { catPoses } from "../../src/theme/cats";
import { colors, fonts, space } from "../../src/theme/colors";

export default function Homework() {
  const router = useRouter();
  const grade = STUDENT_GRADE;
  const uid = accountKey();
  const acct = useClassroom((s) => s.byAccount[uid]) ?? emptyAccount();
  // the list is fixed when the round starts (answering one right removes it from the store, not from this round)
  const [questions] = useState<Question[]>(() =>
    homeworkIds(acct.data.homework, (id) => !!getQuestion(grade, id)?.autoMarkable, acct.homeworkDone).map((id) => getQuestion(grade, id)!));
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [right, setRight] = useState(0);
  const answers = useRef<MinigameResult["answers"]>([]);
  const sent = useRef(false);
  const done = index >= questions.length;

  const send = () => {
    if (sent.current || !answers.current.length) return;
    sent.current = true;
    void reportHomeworkRound(grade, answers.current).then(() => refreshClassroom(true));
  };
  useEffect(() => { if (done) send(); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => send(), []); // leaving early still reports what was answered
  useEffect(() => {
    const h = () => send();
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = questions[index];
  const submit = (responses: string[]) => {
    if (!q) return;
    const r = markQuestion(q, responses);
    answers.current.push({ questionId: q.id, responses });
    setReveal({ correct: r.correct, perPart: r.perPart, showAnswer: true });
    if (r.correct) { setRight((n) => n + 1); useClassroom.getState().markHomeworkDone(uid, q.id); }
  };
  const next = () => { setReveal(null); setIndex((i) => i + 1); };
  const back = () => router.replace("/student");
  const total = questions.length;

  const frame = (body: React.ReactNode) => <View style={{ flex: 1, backgroundColor: colors.bg }}><StudentTopBar />{body}</View>;
  if (!total || done) {
    return frame(
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.l, gap: space.s }}>
        <Image source={catPoses.cup} style={{ width: 140, height: 120 }} resizeMode="contain" />
        <H1>{total ? "Homework done!" : "No homework right now"}</H1>
        {total ? <Text style={{ fontSize: 34, fontFamily: fonts.display, color: colors.primary }}>{right} out of {total} right</Text> : null}
        <Body style={{ textAlign: "center", color: colors.inkSoft }}>
          {total ? (right === total ? "Every one right. Great work!" : "The ones you missed stay on your homework list. Try them again later.") : "Your teacher hasn't given you any questions to try again."}
        </Body>
        <Button title="Back to my class" style={{ marginTop: 12, minWidth: 220 }} onPress={back} />
      </View>,
    );
  }
  const footer = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, padding: space.l, paddingTop: space.s, borderTopWidth: 3, borderTopColor: colors.border, backgroundColor: reveal?.correct ? colors.goodBg : colors.badBg, justifyContent: "center" }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 20, color: reveal?.correct ? colors.good : colors.bad }}>{reveal?.correct ? "Correct! It leaves your list." : "Not quite. It stays on your list."}</Text>
      <Button title={index + 1 < total ? "Next" : "Finish"} variant={reveal?.correct ? "good" : "primary"} onPress={next} style={{ minWidth: 160 }} />
    </View>
  );
  return frame(
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.l, paddingVertical: space.s, width: "100%", maxWidth: 860, alignSelf: "center" }}>
        <Button title="Stop" small variant="ghost" onPress={back} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.display, color: colors.ink }}>Homework · {index + 1}/{total} · {right} right</Text>
          <ProgressBar value={index / total} />
        </View>
      </View>
      <QuestionView key={q.id} question={q} grade={grade} reveal={reveal} onSubmit={submit} footer={footer} />
    </>,
  );
}
