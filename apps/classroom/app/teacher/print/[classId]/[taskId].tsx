// /teacher/print/<classId>/<taskId>[?answers=1]: the A4 print view of a worksheet or test (opens in its own tab).
import React, { useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { backend } from "../../../../src/teacher/client";
import { PrintSheet, type PrintMode } from "../../../../src/teacher/PrintSheet";
import { useTeacher } from "../../../../src/teacher/store";
import { Notice, Spinner, useLoad } from "../../../../src/teacher/ui";
import { colors, space } from "../../../../src/theme/colors";

export default function PrintTask() {
  const { classId, taskId, answers } = useLocalSearchParams<{ classId: string; taskId: string; answers?: string }>();
  const router = useRouter();
  const cls = useTeacher((s) => s.classes.find((c) => c.id === classId));
  const tasks = useLoad(() => backend.listTasks(classId), [classId]);
  const [mode, setMode] = useState<PrintMode>(answers === "1" ? "key" : "sheet");
  const task = tasks.data?.find((t) => t.id === taskId);
  const body = tasks.error ? <Notice kind="error" onRetry={tasks.reload}>{tasks.error}</Notice>
    : tasks.loading ? <Spinner label="Loading the worksheet…" />
    : !cls || !task ? <Notice>That worksheet isn't in your classes.</Notice>
    : null;
  if (body) return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl }}>{body}<Text style={{ color: colors.inkSoft }} onPress={() => router.replace("/teacher")}>Back to the dashboard</Text></View>;
  return <PrintSheet cls={cls!} task={task!} mode={mode} onMode={setMode} onBack={() => router.replace("/teacher")} />;
}
