import { Platform } from "react-native";
import { mockQuery } from "./client";

/** The print view of a task (opens in a new tab so the dashboard stays where it is). `answers`: the teacher's answer key. */
export function printPath(classId: string, taskId: string, answers = false): string {
  const q = [mockQuery().replace("?", ""), answers ? "answers=1" : ""].filter(Boolean).join("&");
  return `/teacher/print/${encodeURIComponent(classId)}/${encodeURIComponent(taskId)}${q ? `?${q}` : ""}`;
}
export function openPrint(classId: string, taskId: string, answers = false): void {
  if (Platform.OS === "web" && typeof window !== "undefined") window.open(printPath(classId, taskId, answers), "_blank");
}
