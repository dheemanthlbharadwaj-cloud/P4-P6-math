// In-app test from the teacher (a "diagnostic" class task), same rules as the game: one try per question, no feedback,
// the right answers are never shown. All answers go to the server together (submitTaskAnswers); the summary shows the
// score only. Leaving halfway asks first (the answers so far are lost).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { MarkValue, Question } from "@p6/shared";
import { Body, Button, H1, ProgressBar } from "../../../src/components/ui";
import { QuestionView } from "../../../src/components/QuestionView";
import { getQuestion } from "../../../src/content";
import { accountKey, submitTest } from "../../../src/student/service";
import { useClassroom } from "../../../src/student/store";
import { StudentTopBar } from "../../../src/student/Shell";
import { scoreCheer, scoreOf, scoreText } from "../../../src/logic/classroom";
import { catPoses } from "../../../src/theme/cats";
import { colors, fonts, space } from "../../../src/theme/colors";

type Answer = { questionId: string; responses: string[] };

export default function TakeTest() {
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const uid = accountKey();
  const task = useClassroom((s) => s.byAccount[uid]?.data.tasks.find((t) => t.id === taskId));
  const classes = useClassroom((s) => s.byAccount[uid]?.data.classes);
  const classIds = useMemo(() => [...new Set([...(task?.classId ? [task.classId] : []), ...(classes ?? []).map((c) => c.id)])], [task, classes]);
  const questions = useMemo<Question[]>(() => (task ? task.questionIds.map((id) => getQuestion(task.grade, id)).filter((q): q is Question => !!q) : []), [task]);
  const [index, setIndex] = useState(0);
  const answers = useRef<Answer[]>([]);
  const [phase, setPhase] = useState<"asking" | "sending" | "failed" | "done">("asking");
  const [marks, setMarks] = useState<Record<string, MarkValue> | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const back = () => router.replace("/student");

  // closing the tab mid-test: the browser asks first
  useEffect(() => {
    if (phase !== "asking" || !questions.length) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase, questions.length]);

  const finish = async () => {
    if (!task) return;
    setPhase("sending");
    try {
      const res = await submitTest(task.grade, classIds, task.id, answers.current);
      setMarks(res);
      useClassroom.getState().setTaken(uid, task.id, scoreOf(res));
      setPhase("done");
    } catch {
      setPhase("failed");
    }
  };
  const submit = (responses: string[]) => {
    const q = questions[index];
    if (!q) return;
    answers.current = [...answers.current.filter((a) => a.questionId !== q.id), { questionId: q.id, responses }];
    if (index + 1 < questions.length) setIndex(index + 1);
    else void finish();
  };

  const frame = (body: React.ReactNode) => <View style={{ flex: 1, backgroundColor: colors.bg }}><StudentTopBar />{body}</View>;
  if (!task || questions.length === 0) {
    return frame(
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.l, gap: space.m }}>
        <H1>No test here</H1>
        <Body style={{ textAlign: "center", color: colors.inkSoft }}>We could not find this test. Go back to your class and try again.</Body>
        <Button title="Back to my class" onPress={back} />
      </View>,
    );
  }
  if (phase !== "asking") {
    const score = marks ? scoreOf(marks) : null;
    return frame(
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.l, gap: space.s }}>
        <Image source={phase === "done" && score && score.right === score.total ? catPoses.cute : catPoses.laptop} style={{ width: 150, height: 130 }} resizeMode="contain" />
        {phase === "sending" ? <H1>Sending your answers...</H1>
          : phase === "failed" ? (
            <>
              <H1>Could not send</H1>
              <Body style={{ textAlign: "center", color: colors.inkSoft }}>Check your internet. Your answers are still here.</Body>
              <Button title="Try again" style={{ marginTop: 8, minWidth: 200 }} onPress={() => void finish()} />
            </>
          ) : (
            <>
              <H1>Test finished!</H1>
              <Text style={{ fontSize: 40, fontFamily: fonts.display, color: colors.primary, marginVertical: 8 }} accessibilityLabel="Your score">{score ? scoreText(score) : ""}</Text>
              <Body style={{ textAlign: "center", color: colors.inkSoft }}>{score ? scoreCheer(score) : ""}</Body>
              <Button title="Back to my class" style={{ marginTop: 12, minWidth: 220 }} onPress={back} />
            </>
          )}
      </View>,
    );
  }
  const q = questions[index];
  return frame(
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.l, paddingVertical: space.s, width: "100%", maxWidth: 860, alignSelf: "center" }}>
        <Pressable onPress={() => setConfirmLeave(true)} accessibilityRole="button" accessibilityLabel="Quit" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink }}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.display, color: colors.ink }}>{task.title} · {index + 1}/{questions.length}</Text>
          <ProgressBar value={index / questions.length} />
        </View>
      </View>
      {confirmLeave ? (
        <View style={{ marginHorizontal: space.l, padding: space.m, borderRadius: 14, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.highlight, gap: space.s, maxWidth: 860, alignSelf: "center", width: "100%" }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.ink }}>Leave this test? Your answers so far will be lost. You can start it again later.</Text>
          <View style={{ flexDirection: "row", gap: space.s }}>
            <Button title="Keep going" small onPress={() => setConfirmLeave(false)} />
            <Button title="Leave" small variant="bad" onPress={back} />
          </View>
        </View>
      ) : null}
      <QuestionView key={q.id} question={q} grade={task.grade} reveal={null} submitLabel={index + 1 < questions.length ? "Next" : "Finish"} onSubmit={submit} />
    </>,
  );
}
