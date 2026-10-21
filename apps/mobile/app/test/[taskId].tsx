// In-app test from the teacher (a "diagnostic" class task): one try per question, no hearts, no feedback and the right
// answers are never shown. All answers go to the server together (submitTaskAnswers); the summary shows the score only.
import React, { useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Grade, MarkValue, Question } from "@p6/shared";
import { Body, Button, H1, ProgressBar, Screen } from "../../src/components/ui";
import { QuestionPanel } from "../../src/components/QuestionPanel";
import { CatCompanion } from "../../src/components/CatCompanion";
import { useLeaveConfirm } from "../../src/components/LeaveConfirm";
import { getQuestion } from "../../src/content";
import { accountKey, submitTaskAnswers } from "../../src/services/classroom";
import { useClassroom } from "../../src/store/classroom";
import { useQuestionOrientation } from "../../src/hooks/useQuestionOrientation";
import { scoreCheer, scoreOf, scoreText } from "../../src/logic/classroom";
import { colors, fonts, space } from "../../src/theme/colors";

type Answer = { questionId: string; responses: string[] };

export default function TakeTest() {
  const router = useRouter();
  useQuestionOrientation();
  const { taskId, grade: g } = useLocalSearchParams<{ taskId: string; grade?: string }>();
  const uid = accountKey();
  const task = useClassroom((s) => s.byAccount[uid]?.data.tasks.find((t) => t.id === taskId));
  const classId = useClassroom((s) => s.byAccount[uid]?.data.classes[0]?.id ?? "");
  const grade = (task?.grade ?? g ?? "P6") as Grade;
  const questions = useMemo<Question[]>(
    () => (task?.questionIds ?? []).map((id) => getQuestion(grade, id)).filter((q): q is Question => !!q),
    [task, grade],
  );
  const [index, setIndex] = useState(0);
  const answers = useRef<Answer[]>([]);
  const [phase, setPhase] = useState<"asking" | "sending" | "failed" | "done">("asking");
  const [marks, setMarks] = useState<Record<string, MarkValue> | null>(null);

  const finish = async () => {
    setPhase("sending");
    try {
      const res = await submitTaskAnswers(grade, classId, taskId as string, answers.current);
      setMarks(res);
      useClassroom.getState().setTaken(uid, taskId as string, scoreOf(res));
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

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/classroom"));
  const leaveConfirm = useLeaveConfirm({
    enabled: phase === "asking" && questions.length > 0,
    title: "Leave this test?",
    body: "Your answers so far will be lost. You can start the test again later.",
    fallback: "/(tabs)/classroom",
  });

  if (!task || questions.length === 0) {
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.l }}>
          <H1>No test here</H1>
          <Body style={{ textAlign: "center", color: colors.inkSoft, marginTop: 6 }}>We could not find this test. Go back to your class and try again.</Body>
        </View>
        <View style={{ padding: space.l }}><Button title="Back to classroom" onPress={back} /></View>
      </Screen>
    );
  }

  if (phase !== "asking") {
    const score = marks ? scoreOf(marks) : null;
    return (
      <Screen edges={["top", "bottom"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.l }}>
          <CatCompanion mood={phase === "done" && score && score.right === score.total ? "correct" : "idle"} size={150} />
          {phase === "sending" ? (
            <H1 style={{ marginTop: 12 }}>Sending your answers...</H1>
          ) : phase === "failed" ? (
            <>
              <H1 style={{ marginTop: 12 }}>Could not send</H1>
              <Body style={{ textAlign: "center", color: colors.inkSoft, marginTop: 6 }}>Check your internet. Your answers are still here.</Body>
              <Button title="Try again" style={{ marginTop: 16, minWidth: 200 }} onPress={() => void finish()} />
            </>
          ) : (
            <>
              <H1 style={{ marginTop: 12 }}>Test finished!</H1>
              <Text style={{ fontSize: 40, fontFamily: fonts.display, color: colors.primary, marginVertical: 8 }} accessibilityLabel="Your score">{score ? scoreText(score) : ""}</Text>
              <Body style={{ textAlign: "center", color: colors.inkSoft }}>{score ? scoreCheer(score) : ""}</Body>
            </>
          )}
        </View>
        {phase === "done" ? <View style={{ padding: space.l }}><Button title="Back to classroom" onPress={back} /></View> : null}
      </Screen>
    );
  }

  const q = questions[index];
  return (
    <Screen edges={["top", "bottom"]}>
      {leaveConfirm.modal}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.m, paddingVertical: space.s, gap: 10 }}>
        <Pressable onPress={leaveConfirm.ask} accessibilityRole="button" accessibilityLabel="Quit" style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink }}>✕</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.display, color: colors.ink }}>{task.title} · {index + 1}/{questions.length}</Text>
          <ProgressBar value={index / questions.length} />
        </View>
      </View>
      <QuestionPanel key={q.id} question={q} grade={grade} reveal={null} canSkip={false} submitLabel={index + 1 < questions.length ? "Next" : "Finish"} onSubmit={submit} />
    </Screen>
  );
}
