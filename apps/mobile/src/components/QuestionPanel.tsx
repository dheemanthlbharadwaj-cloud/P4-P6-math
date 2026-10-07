// One question: stem (RichText), figure + zoom viewer, MCQ options or one input per answer part,
// calculator button / "No calculator" badge, Submit and optional Skip. Marking is done by the parent via
// markQuestion() from @p6/shared; this component only collects responses and shows feedback.
import React, { useEffect, useState } from "react";
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type KeyboardTypeOptions } from "react-native";
import type { Grade, Question, ReportQuestionRequest } from "@p6/shared";
import { RichText } from "./RichText";
import { Button } from "./ui";
import { CalculatorModal } from "./Calculator";
import { FigureViewer } from "./FigureViewer";
import { Scratchpad } from "./Scratchpad";
import { ReportSheet } from "./ReportSheet";
import { useToast } from "./Toast";
import { getFigure } from "../content";
import { uiAssets } from "../theme/assets";
import { BUBBLE_BAND } from "./CatCompanion";
import { colors, font, fonts, MIN_TOUCH, radius, space } from "../theme/colors";

export interface Reveal {
  correct: boolean;
  perPart: boolean[];
  /** show the correct answer(s) (review mode) */
  showAnswer?: boolean;
}

interface Props {
  question: Question;
  grade: Grade;
  reveal?: Reveal | null; // when set the inputs are locked and coloured
  onSubmit: (responses: string[]) => void;
  onSkip?: () => void;
  canSkip?: boolean;
  submitLabel?: string;
  /** Classroom "Practice (show answer)": no answer boxes or submit bar; the parent reveals the answer and self-marks. */
  viewOnly?: boolean;
  /** Companion cat shown beside the tools row in portrait (hidden in landscape to leave room for the scratchpad). */
  companion?: React.ReactNode;
  /** Shows "Report" (a problem with this question → the question bank editor); the value says where it was seen. */
  reportContext?: ReportQuestionRequest["context"];
}

function keyboardFor(kind: string, value?: number): KeyboardTypeOptions {
  if (kind === "number") return (value ?? 0) < 0 ? "numbers-and-punctuation" : "decimal-pad";
  if (kind === "text") return "default";
  return "numbers-and-punctuation"; // fraction ("a/b", "w a/b") and ratio ("a:b")
}

let hintDismissed = false; // once per app session

export function QuestionPanel({ question: q, grade, reveal, onSubmit, onSkip, canSkip = true, submitLabel = "Submit", viewOnly = false, companion, reportContext }: Props) {
  const nInputs = q.type === "mcq" ? 1 : Math.max(1, q.parts?.length ?? 1);
  const [responses, setResponses] = useState<string[]>(() => Array(nInputs).fill(""));
  const [calc, setCalc] = useState(false);
  const [figOpen, setFigOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const toast = useToast();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [hintGone, setHintGone] = useState(hintDismissed);
  const showHint = !landscape && !hintGone && (Platform.OS !== "web" || width >= 600);
  useEffect(() => setResponses(Array(nInputs).fill("")), [q.id, nInputs]);

  const fig = getFigure(grade, q.figure);
  const locked = !!reveal || viewOnly;
  const ready = responses.every((r) => r.trim().length > 0);
  const setAt = (i: number, v: string) => setResponses((rs) => rs.map((x, j) => (j === i ? v : x)));

  const left = (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: landscape ? space.m : space.l, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        {showHint ? (
          <Pressable onPress={() => { hintDismissed = true; setHintGone(true); }} accessibilityRole="button" accessibilityLabel="Dismiss hint" style={styles.rotateHint}>
            <Text style={styles.rotateHintText}>Turn your phone sideways for a working space</Text>
            <Text style={styles.rotateHintX}>✕</Text>
          </Pressable>
        ) : null}
        <View style={styles.toolsRow}>
        <View style={[styles.tools, { flex: 1, flexWrap: "wrap", alignItems: "flex-start", alignContent: "flex-start" }, companion && !landscape ? { paddingTop: BUBBLE_BAND } : null]}>
          {q.calculatorAllowed ? (
            <Pressable onPress={() => setCalc(true)} accessibilityRole="button" accessibilityLabel="Open calculator"
              style={({ pressed }) => [styles.toolBtn, styles.toolRow, { backgroundColor: "#d9f2f8" }, pressed && { transform: [{ scale: 0.96 }] }]}>
              <Image source={uiAssets.icons.calculator} style={styles.toolIcon} />
              <Text style={[styles.toolText, { color: colors.ink }]}>Calculator</Text>
            </Pressable>
          ) : (
            <View style={[styles.toolBtn, styles.toolRow, { backgroundColor: "#eef0f5", borderColor: colors.muted }]} accessibilityRole="text" accessibilityLabel="No calculator allowed for this question">
              <Image source={uiAssets.icons.noCalculator} style={[styles.toolIcon, { opacity: 0.85 }]} />
              <Text style={[styles.toolText, { color: colors.inkSoft }]}>No calculator</Text>
            </View>
          )}
          {fig ? (
            <Pressable style={[styles.toolBtn, { backgroundColor: colors.accent }]} onPress={() => setFigOpen(true)} accessibilityRole="button" accessibilityLabel="View picture full screen">
              <Text style={[styles.toolText, { color: colors.ink }]}>Picture</Text>
            </Pressable>
          ) : null}
          {reportContext ? (
            <Pressable style={[styles.toolBtn, { backgroundColor: colors.card, borderColor: colors.muted }]} onPress={() => setReportOpen(true)} accessibilityRole="button" accessibilityLabel="Report a problem with this question">
              <Text style={[styles.toolText, { color: colors.inkSoft }]}>⚑ Report</Text>
            </Pressable>
          ) : null}
        </View>
        {companion && !landscape ? <View style={{ marginLeft: 6, marginTop: -4 }}>{companion}</View> : null}
        </View>

        <RichText tokens={q.stem} size={font.body + 2} />

        {fig ? (
          <Pressable onPress={() => setFigOpen(true)} accessibilityLabel="Tap to enlarge picture" style={styles.figWrap}>
            <Image source={fig} style={styles.fig} resizeMode="contain" />
          </Pressable>
        ) : null}

        {q.type === "mcq" ? (
          <View style={{ marginTop: space.l }}>
            {(q.options ?? []).map((o) => {
              const picked = responses[0] === o.key;
              const isRight = reveal && o.key === q.correctOption;
              const isWrongPick = reveal && picked && !reveal.correct;
              return (
                <Pressable
                  key={o.key}
                  disabled={locked}
                  onPress={() => setAt(0, o.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: picked, disabled: locked }}
                  style={[styles.option, picked && styles.optionPicked, isRight && styles.optionRight, isWrongPick && styles.optionWrong]}
                >
                  <View style={[styles.optKey, { backgroundColor: OPTION_COLORS[(Number(o.key) - 1 + OPTION_COLORS.length) % OPTION_COLORS.length] ?? colors.primary }, picked && styles.optKeyPicked]}>
                    <Text style={styles.optKeyText}>{o.key}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <RichText tokens={o.text} size={font.body} />
                  </View>
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
              return (
                <View key={i} style={{ marginBottom: space.m }}>
                  {p.label?.length || p.part ? (
                    <View style={{ flexDirection: "row", marginBottom: 4 }}>
                      {p.part ? <Text style={styles.partTag}>({p.part}) </Text> : null}
                      {p.label?.length ? <View style={{ flex: 1 }}><RichText tokens={p.label} size={font.body} /></View> : null}
                    </View>
                  ) : null}
                  {viewOnly ? null : <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TextInput
                      value={responses[i] ?? ""}
                      editable={!locked}
                      onChangeText={(t) => setAt(i, t)}
                      keyboardType={keyboardFor(kind, kind === "number" ? p.answer.value : undefined)}
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder={kind === "fraction" ? "e.g. 3/4 or 1 1/2" : kind === "ratio" ? "e.g. 3:4" : "Your answer"}
                      placeholderTextColor={colors.muted}
                      accessibilityLabel={p.part ? `Answer for part ${p.part}` : "Answer"}
                      style={[styles.input, state === "right" && { backgroundColor: colors.goodBg, borderColor: colors.good }, state === "wrong" && { backgroundColor: colors.badBg, borderColor: colors.bad }]}
                    />
                    {unit ? <Text style={styles.unit}>{unit}</Text> : null}
                  </View>}
                  {kind === "fraction" && !locked ? (
                    <View style={{ flexDirection: "row", marginTop: 6, gap: 8 }}>
                      <Button title="/" small variant="ghost" style={styles.helper} onPress={() => setAt(i, (responses[i] ?? "") + "/")} />
                      <Button title="space" small variant="ghost" style={[styles.helper, { minWidth: 80 }]} onPress={() => setAt(i, (responses[i] ?? "") + " ")} />
                      <Text style={styles.hint}>Mixed number: whole, space, then a/b</Text>
                    </View>
                  ) : null}
                  {reveal?.showAnswer ? <Text style={styles.answerLine}>Answer: {p.display || "no model answer in the question bank yet"}</Text> : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {!locked ? (
        <View style={styles.bar}>
          {onSkip ? <Button title="Skip" variant="ghost" onPress={onSkip} disabled={!canSkip} style={{ flex: 1 }} /> : null}
          <Button title={submitLabel} variant="good" onPress={() => onSubmit(responses)} disabled={!ready} style={{ flex: 2 }} />
        </View>
      ) : null}

      <CalculatorModal visible={calc} onClose={() => setCalc(false)} />
      {fig ? <FigureViewer source={fig} visible={figOpen} onClose={() => setFigOpen(false)} /> : null}
      {reportContext ? (
        <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} onDone={toast.show} questionId={q.id} grade={grade} context={reportContext}
          answerGiven={responses.some((r) => r.trim()) ? responses.map((r) => r.trim()).join(" | ") : undefined} />
      ) : null}
      {toast.node}
    </KeyboardAvoidingView>
  );

  if (!landscape) return left;
  // Landscape: question on the left (~45%), working space on the right (~55%).
  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <View style={{ flex: 45 }}>{left}</View>
      <View style={{ flex: 55, padding: space.m, paddingLeft: space.s }}><Scratchpad /></View>
    </View>
  );
}

// Candy colours for the option number badges (1–4), like game answer buttons.
const OPTION_COLORS = ["#12aecf", "#ff8f1f", "#3fae49", "#ef5b9c"];

const styles = StyleSheet.create({
  rotateHint: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 8, minHeight: 32, marginBottom: space.s, paddingHorizontal: 10, borderRadius: radius.s, backgroundColor: colors.highlight },
  rotateHintText: { fontSize: 12, fontWeight: "700", color: colors.inkSoft },
  rotateHintX: { fontSize: 12, fontFamily: fonts.display, color: colors.inkSoft },
  toolsRow: { flexDirection: "row", alignItems: "flex-start" },
  tools: { flexDirection: "row", gap: 10, marginBottom: space.m },
  toolBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.m, borderWidth: 3, borderColor: colors.border, justifyContent: "center" },
  toolText: { color: "#fff", fontFamily: fonts.display, fontSize: font.small },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 8 },
  toolIcon: { width: 28, height: 28 },
  figWrap: { marginTop: space.m, backgroundColor: "#fff", borderRadius: radius.m, borderWidth: 2, borderColor: colors.border, padding: 6 },
  fig: { width: "100%", height: 200 },
  option: { flexDirection: "row", alignItems: "center", minHeight: MIN_TOUCH + 8, backgroundColor: colors.card, borderRadius: radius.m, borderWidth: 3, borderColor: colors.border, padding: 10, marginBottom: 10, gap: 12 },
  optionPicked: { borderColor: colors.primary, backgroundColor: "#e2f6fb" },
  optionRight: { borderColor: colors.good, backgroundColor: colors.goodBg },
  optionWrong: { borderColor: colors.bad, backgroundColor: colors.badBg },
  optKey: { width: 38, height: 38, borderRadius: 12, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4, alignItems: "center", justifyContent: "center" },
  optKeyPicked: { transform: [{ scale: 1.12 }], borderColor: colors.primaryDark },
  optKeyText: { fontFamily: fonts.display, fontSize: font.body + 1, color: "#fff", textShadowColor: "rgba(0,0,0,0.3)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  partTag: { fontFamily: fonts.display, fontSize: font.body, color: colors.primaryDark },
  input: { flex: 1, minHeight: 56, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 22, backgroundColor: "#fff", color: colors.ink },
  unit: { marginLeft: 8, fontSize: font.body, fontWeight: "800", color: colors.inkSoft },
  helper: { minWidth: 56 },
  hint: { alignSelf: "center", color: colors.inkSoft, fontSize: 12, flexShrink: 1 },
  answerLine: { marginTop: 4, color: colors.good, fontFamily: fonts.display, fontSize: font.body },
  bar: { flexDirection: "row", gap: 12, padding: space.l, paddingTop: space.s, backgroundColor: colors.bg, borderTopWidth: 3, borderTopColor: colors.border },
});
