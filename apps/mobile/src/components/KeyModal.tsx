// "Find the key": 1 basic MCQ from the topic's unlockPool. Correct → topic unlocked.
import React, { useMemo, useState } from "react";
import { Modal, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { markQuestion, type Grade, type TopicMap } from "@p6/shared";
import { QuestionPanel, type Reveal } from "./QuestionPanel";
import { Body, Button, H2 } from "./ui";
import { CatCompanion } from "./CatCompanion";
import { getUnlockQuestion } from "../content";
import { useProgress } from "../store/progress";
import { colors, fonts, space } from "../theme/colors";

export function KeyModal({ grade, topic, visible, onClose }: { grade: Grade; topic: TopicMap | null; visible: boolean; onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const question = useMemo(() => (topic && visible ? getUnlockQuestion(grade, topic.id) : undefined), [grade, topic, visible, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setReveal(null); setAttempt(0); onClose(); };
  const submit = (responses: string[]) => {
    if (!question || !topic) return;
    const r = markQuestion(question, responses);
    setReveal({ correct: r.correct, perPart: r.perPart });
    if (r.correct) useProgress.getState().unlockTopic(grade, topic.id);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ padding: space.l, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <H2>Find the key</H2>
            <Body style={{ color: colors.inkSoft }}>Answer this to unlock {topic?.name}.</Body>
          </View>
          <CatCompanion mood={reveal ? (reveal.correct ? "correct" : "wrong") : "thinking"} size={80} />
        </View>
        {question ? (
          <QuestionPanel question={question} grade={grade} reveal={reveal} onSubmit={submit} submitLabel="Unlock" />
        ) : (
          <View style={{ flex: 1, padding: space.l }}><Body>No key question is available for this topic yet.</Body></View>
        )}
        {reveal ? (
          <View style={{ padding: space.l, gap: 10 }}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: reveal.correct ? colors.good : colors.bad, textAlign: "center" }}>
              {reveal.correct ? "Unlocked! Have fun exploring." : "Not quite. Try another key."}
            </Text>
            {reveal.correct ? (
              <Button title="Open the map" variant="good" onPress={close} />
            ) : (
              <Button title="Try another question" onPress={() => { setReveal(null); setAttempt((a) => a + 1); }} />
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: space.l, paddingBottom: space.l }}>
            <Button title="Not now" variant="ghost" onPress={close} />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
