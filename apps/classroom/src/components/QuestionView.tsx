// One question for the student area (in-app tests and homework), adapted from the game's QuestionPanel: stem (RichText),
// figure (tap to enlarge), MCQ options or one box per answer part with the game's format hints, the calculator for
// calculator-allowed questions, and Submit. Marking is done by the parent (markQuestion / the server). A wrong answer
// never reveals the right one (owner rule, logic/feedback.ts). No working-space pad here (paper is fine on the web).
import React, { useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import type { Grade, Question } from "@p6/shared";
import { answerFormatHint } from "@p6/shared";
import { RichText } from "./RichText";
import { Button } from "./ui";
import { CALC_ICON, CalculatorModal, NO_CALC_ICON } from "./Calculator";
import { FigureImg } from "./FigureImg";
import { FigureViewer } from "./FigureViewer";
import { useFigure } from "../content/useFigure";
import { showAnswerLines, showCorrectOption } from "../logic/feedback";
import { colors, font, fonts, MIN_TOUCH, radius, space } from "../theme/colors";

export interface Reveal { correct: boolean; perPart: boolean[]; showAnswer?: boolean }

const OPTION_COLORS = ["#12aecf", "#ff8f1f", "#3fae49", "#ef5b9c"];

export function QuestionView({ question: q, grade, reveal, onSubmit, submitLabel = "Submit", footer }: {
  question: Question; grade: Grade; reveal?: Reveal | null; onSubmit: (responses: string[]) => void; submitLabel?: string;
  /** shown instead of the Submit bar once the question is marked (e.g. feedback + Next) */
  footer?: React.ReactNode;
}) {
  const nInputs = q.type === "mcq" ? 1 : Math.max(1, q.parts?.length ?? 1);
  const [responses, setResponses] = useState<string[]>(() => Array(nInputs).fill(""));
  const [calc, setCalc] = useState(false);
  const [figOpen, setFigOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const big = width >= 900;
  const textSize = big ? font.body + 2 : font.body;
  const figHeight = width < 600 ? 200 : Math.round(Math.min(420, Math.max(220, height * 0.32)));
  useEffect(() => setResponses(Array(nInputs).fill("")), [q.id, nInputs]);
  const fig = useFigure(grade, q.figure, q.id);
  const locked = !!reveal;
  const ready = responses.every((r) => r.trim().length > 0);
  const setAt = (i: number, v: string) => setResponses((rs) => rs.map((x, j) => (j === i ? v : x)));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.l, paddingBottom: space.xl, width: "100%", maxWidth: 860, alignSelf: "center" }} keyboardShouldPersistTaps="handled">
        <View style={styles.tools}>
          {q.calculatorAllowed ? (
            <Pressable onPress={() => setCalc(true)} accessibilityRole="button" accessibilityLabel="Open calculator" style={[styles.toolBtn, { backgroundColor: "#d9f2f8" }]}>
              <Image source={CALC_ICON} style={styles.toolIcon} />
              <Text style={styles.toolText}>Calculator</Text>
            </Pressable>
          ) : (
            <View style={[styles.toolBtn, { backgroundColor: "#eef0f5", borderColor: colors.muted }]} accessibilityLabel="No calculator allowed for this question">
              <Image source={NO_CALC_ICON} style={[styles.toolIcon, { opacity: 0.85 }]} />
              <Text style={[styles.toolText, { color: colors.inkSoft }]}>No calculator</Text>
            </View>
          )}
        </View>

        <RichText tokens={q.stem} size={textSize + 2} />

        {fig ? (
          <Pressable onPress={() => setFigOpen(true)} accessibilityLabel="Tap to enlarge picture" style={styles.figWrap}>
            <FigureImg fig={fig} style={{ width: "100%", height: figHeight }} />
          </Pressable>
        ) : null}

        {q.type === "mcq" ? (
          <View style={{ marginTop: space.l }}>
            {(q.options ?? []).map((o, i) => {
              const picked = responses[0] === o.key;
              const isRight = showCorrectOption(reveal) && o.key === q.correctOption;
              const isWrongPick = !!reveal && picked && !reveal.correct;
              return (
                <Pressable key={o.key} disabled={locked} onPress={() => setAt(0, o.key)} accessibilityRole="radio" accessibilityState={{ selected: picked, disabled: locked }}
                  style={[styles.option, picked && styles.optionPicked, isRight && styles.optionRight, isWrongPick && styles.optionWrong]}>
                  <View style={[styles.optKey, { backgroundColor: OPTION_COLORS[i % OPTION_COLORS.length] }]}><Text style={styles.optKeyText}>{o.key}</Text></View>
                  <View style={{ flex: 1 }}><RichText tokens={o.text} size={textSize} /></View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={{ marginTop: space.l }}>
            {(q.parts ?? []).map((p, i) => {
              const kind = p.answer.kind;
              const unit = "unit" in p.answer ? p.answer.unit : undefined;
              const state = reveal ? (reveal.perPart[i] ? "right" : "wrong") : "idle";
              const hint = answerFormatHint(p);
              return (
                <View key={i} style={{ marginBottom: space.m }}>
                  {p.label?.length || p.part ? (
                    <View style={{ flexDirection: "row", marginBottom: 4 }}>
                      {p.part ? <Text style={styles.partTag}>({p.part}) </Text> : null}
                      {p.label?.length ? <View style={{ flex: 1 }}><RichText tokens={p.label} size={font.body} /></View> : null}
                    </View>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TextInput value={responses[i] ?? ""} editable={!locked} onChangeText={(t) => setAt(i, t)} autoCapitalize="none" autoCorrect={false}
                      placeholder={kind === "fraction" ? "e.g. 3/4 or 1 1/2" : kind === "ratio" ? "e.g. 3:4" : "Your answer"} placeholderTextColor={colors.muted}
                      accessibilityLabel={p.part ? `Answer for part ${p.part}` : "Answer"} onSubmitEditing={() => { if (ready && !locked) onSubmit(responses); }}
                      style={[styles.input, state === "right" && { backgroundColor: colors.goodBg, borderColor: colors.good }, state === "wrong" && { backgroundColor: colors.badBg, borderColor: colors.bad }]} />
                    {unit ? <Text style={styles.unit}>{unit}</Text> : null}
                  </View>
                  {!locked && kind !== "fraction" && hint ? <Text style={styles.formatHint}>{hint}</Text> : null}
                  {kind === "fraction" && !locked ? <Text style={styles.formatHint}>Fraction: 3/4 · mixed number: whole, space, then a/b (1 1/2)</Text> : null}
                  {showAnswerLines(reveal) ? <Text style={styles.answerLine}>Answer: {p.display}</Text> : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
      {locked ? footer ?? null : (
        <View style={styles.bar}>
          <Button title={submitLabel} variant="good" onPress={() => onSubmit(responses)} disabled={!ready} style={{ flex: 1, maxWidth: 520 }} />
        </View>
      )}
      <CalculatorModal visible={calc} onClose={() => setCalc(false)} />
      {fig ? <FigureViewer source={fig} visible={figOpen} onClose={() => setFigOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tools: { flexDirection: "row", gap: 10, marginBottom: space.m, flexWrap: "wrap" },
  toolBtn: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 8, paddingRight: 14, borderRadius: radius.m, borderWidth: 3, borderColor: colors.border },
  toolText: { fontFamily: fonts.display, fontSize: font.small, color: colors.ink },
  toolIcon: { width: 28, height: 28 },
  figWrap: { marginTop: space.m, backgroundColor: "#fff", borderRadius: radius.m, borderWidth: 2, borderColor: colors.border, padding: 6 },
  option: { flexDirection: "row", alignItems: "center", minHeight: MIN_TOUCH + 8, backgroundColor: colors.card, borderRadius: radius.m, borderWidth: 3, borderColor: colors.border, padding: 10, marginBottom: 10, gap: 12 },
  optionPicked: { borderColor: colors.primary, backgroundColor: "#e2f6fb" },
  optionRight: { borderColor: colors.good, backgroundColor: colors.goodBg },
  optionWrong: { borderColor: colors.bad, backgroundColor: colors.badBg },
  optKey: { width: 38, height: 38, borderRadius: 12, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, alignItems: "center", justifyContent: "center" },
  optKeyText: { fontFamily: fonts.display, fontSize: font.body + 1, color: "#fff" },
  partTag: { fontFamily: fonts.display, fontSize: font.body, color: colors.primaryDark },
  input: { flex: 1, minHeight: 56, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 22, backgroundColor: "#fff", color: colors.ink },
  unit: { marginLeft: 8, fontSize: font.body, fontWeight: "800", color: colors.inkSoft },
  formatHint: { marginTop: 4, marginLeft: 4, color: colors.inkSoft, fontSize: 13 },
  answerLine: { marginTop: 4, color: colors.good, fontFamily: fonts.display, fontSize: font.body },
  bar: { flexDirection: "row", justifyContent: "center", padding: space.l, paddingTop: space.s, backgroundColor: colors.bg, borderTopWidth: 3, borderTopColor: colors.border },
});
