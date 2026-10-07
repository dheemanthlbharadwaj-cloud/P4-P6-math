// "Report a problem" with a question: pick a reason, optionally say more, send. The report lands in the question
// bank editor (question_reports), where the team fixes the question. Needs an account and internet.
import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { MAX_REPORT_NOTE, REPORT_REASONS, type Grade, type ReportQuestionRequest, type ReportReason } from "@p6/shared";
import { Button, H2, Sheet } from "./ui";
import { api, ApiError } from "../services/api";
import { getContentVersion } from "../content";
import { colors, fonts, radius, space } from "../theme/colors";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called with a short message once the report is sent (or could not be). */
  onDone: (message: string) => void;
  questionId: string;
  grade: Grade;
  context: ReportQuestionRequest["context"];
  /** What the student entered, if anything. */
  answerGiven?: string;
}

export function ReportSheet({ visible, onClose, onDone, questionId, grade, context, answerGiven }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (visible) { setReason(null); setNote(""); setError(null); } }, [visible, questionId]);

  const needsNote = reason === "other" && !note.trim();
  const send = async () => {
    if (!reason) return;
    setBusy(true); setError(null);
    try {
      const res = await api.reportQuestion({ questionId, grade, reason, note: note.trim() || undefined, context, answerGiven: answerGiven || undefined, contentVersion: getContentVersion(grade) });
      onClose();
      onDone(res.updated ? "Thanks! We updated your report." : "Thanks! Our team will check this question.");
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      setError(code === "not-signed-in" ? "Sign in to report a question."
        : code === "resource-exhausted" ? "That's a lot of reports today. Try again tomorrow."
          : code === "not-found" ? "We couldn't find this question to report."
            : "Couldn't send. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={busy ? undefined : onClose}>
      <H2>Report a problem</H2>
      <Text style={{ color: colors.inkSoft, fontWeight: "700", marginTop: 4, marginBottom: space.m }}>What is wrong with this question?</Text>
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {REPORT_REASONS.map((r) => {
          const on = reason === r.id;
          return (
            <Pressable key={r.id} onPress={() => setReason(r.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 14, borderRadius: radius.m, borderWidth: 3, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? "#e2f6fb" : colors.card }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 15, color: colors.ink }}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput value={note} onChangeText={setNote} maxLength={MAX_REPORT_NOTE} multiline
        placeholder={reason === "other" ? "Tell us what is wrong" : "Anything else? (optional)"} placeholderTextColor={colors.muted} accessibilityLabel="Report details"
        style={{ marginTop: space.m, minHeight: 72, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, padding: 10, fontSize: 16, color: colors.ink, backgroundColor: "#fff", textAlignVertical: "top" }} />
      {error ? <Text style={{ color: colors.bad, fontWeight: "800", marginTop: 8 }}>{error}</Text> : null}
      <Button title={busy ? "Sending…" : "Send report"} onPress={() => void send()} disabled={!reason || needsNote || busy} style={{ marginTop: space.m }} />
      <Button title="Cancel" variant="ghost" onPress={onClose} disabled={busy} style={{ marginTop: 10 }} />
    </Sheet>
  );
}
