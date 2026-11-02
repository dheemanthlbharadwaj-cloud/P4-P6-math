// Pure helpers for the teacher dashboard (no React, no network): birthdays, dates, the marking grid, analytics
// formatting and the Cloudinary upload request. Tested in helpers.test.ts.
import type { ClassQuestionRow, ClassStudent, MarkValue, PostAttachment, PostKind, QuestionRow, TaskMarks, TopicProgress } from "@p6/shared";

// ---------- dates ----------
const SGT = "Asia/Singapore";
/** "21 Oct 2026" in Singapore time. */
export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: SGT });
}
/** "21 Oct, 3:05 pm" in Singapore time. */
export function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const day = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: SGT });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: SGT }).toLowerCase();
  return `${day}, ${time}`;
}
/** "2026-11-05" (also "5/11/2026" or "5-11-2026") → the end of that day in Singapore (23:59 +08:00), or null. */
export function parseDueDate(input: string): number | null {
  const s = input.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; } else {
    r = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
    if (!r) return null;
    d = +r[1]; m = +r[2]; y = +r[3];
  }
  if (m < 1 || m > 12 || d < 1 || d > daysIn(m, y)) return null;
  return Date.UTC(y, m - 1, d, 23, 59) - 8 * 3_600_000;
}
function daysIn(month: number, year: number): number {
  return month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// ---------- birthdays ("MM-DD") ----------
/** "3-7", "03/07" or "03-07" → "03-07"; null when it is not a real day (29 Feb is allowed). */
export function normalizeBirthday(input: string): string | null {
  const r = /^\s*(\d{1,2})\s*[-/]\s*(\d{1,2})\s*$/.exec(input);
  if (!r) return null;
  const m = +r[1], d = +r[2];
  if (m < 1 || m > 12 || d < 1 || d > daysIn(m, 2024)) return null;
  return `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "03-07" → "7 Mar". */
export function formatBirthday(b: string | undefined): string {
  if (!b) return "";
  const n = normalizeBirthday(b);
  return n ? `${+n.slice(3)} ${MONTHS[+n.slice(0, 2) - 1]}` : b;
}
export const sortRoster = (students: readonly ClassStudent[]): ClassStudent[] =>
  [...students].sort((a, b) => a.displayName.localeCompare(b.displayName, "en", { sensitivity: "base" }));

// ---------- posts ----------
export const POST_BADGE: Record<PostKind, string | null> = { teacher: null, milestone: "Milestone", birthday: "Birthday" };
export function attachmentKind(fileName: string, mime?: string): PostAttachment["kind"] {
  if (mime === "application/pdf" || /\.pdf$/i.test(fileName)) return "pdf";
  if ((mime ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(fileName)) return "image";
  return "link";
}
export function canPost(text: string, attachments: readonly PostAttachment[], max: number): { ok: boolean; reason?: string } {
  const t = text.trim();
  if (!t && attachments.length === 0) return { ok: false, reason: "Write something or attach a file." };
  if (t.length > max) return { ok: false, reason: `Too long (${t.length}/${max}).` };
  return { ok: true };
}

// ---------- Cloudinary signed upload ----------
export interface UploadSignature { cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string; publicId: string }
export const cloudinaryUploadUrl = (cloudName: string) => `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
/** The form fields next to the file (exactly what the server signed: folder, public_id, timestamp). */
export function uploadFields(s: UploadSignature): Record<string, string> {
  return { api_key: s.apiKey, timestamp: String(s.timestamp), signature: s.signature, folder: s.folder, public_id: s.publicId };
}

// ---------- marking grid ----------
export type MarkMap = Record<string /* questionId */, MarkValue>;
export type Grid = Record<string /* studentUid */, MarkMap>;

/** Empty → right → wrong → empty. */
export function cycleMark(cur: MarkValue | undefined): MarkValue | undefined {
  return cur === undefined ? "right" : cur === "right" ? "wrong" : undefined;
}
export function setCell(grid: Grid, studentUid: string, questionId: string, v: MarkValue | undefined): Grid {
  const row = { ...(grid[studentUid] ?? {}) };
  if (v === undefined) delete row[questionId]; else row[questionId] = v;
  return { ...grid, [studentUid]: row };
}
export function setRow(grid: Grid, studentUid: string, questionIds: readonly string[], v: MarkValue | undefined): Grid {
  const row: MarkMap = {};
  if (v) for (const q of questionIds) row[q] = v;
  return { ...grid, [studentUid]: row };
}
/** The saved marks as a grid (only the task's questions). */
export function gridFromMarks(saved: readonly TaskMarks[], questionIds: readonly string[]): Grid {
  const ids = new Set(questionIds);
  const g: Grid = {};
  for (const m of saved) {
    const row: MarkMap = {};
    for (const [q, v] of Object.entries(m.marks)) if (ids.has(q)) row[q] = v;
    g[m.studentUid] = row;
  }
  return g;
}
/** What teacherMarkTask gets: the marked questions in task order. */
export function marksPayload(row: MarkMap | undefined, questionIds: readonly string[]): MarkMap {
  const out: MarkMap = {};
  for (const q of questionIds) { const v = row?.[q]; if (v) out[q] = v; }
  return out;
}
export function sameMarks(a: MarkMap | undefined, b: MarkMap | undefined, questionIds: readonly string[]): boolean {
  return questionIds.every((q) => (a?.[q] ?? null) === (b?.[q] ?? null));
}
export function markSummary(row: MarkMap | undefined, questionIds: readonly string[]): { right: number; wrong: number; unmarked: number } {
  let right = 0, wrong = 0;
  for (const q of questionIds) { const v = row?.[q]; if (v === "right") right++; else if (v === "wrong") wrong++; }
  return { right, wrong, unmarked: questionIds.length - right - wrong };
}
/** Per question: how many students got it right / wrong in the grid (column footer). */
export function columnSummary(grid: Grid, studentUids: readonly string[], questionId: string): { right: number; wrong: number } {
  let right = 0, wrong = 0;
  for (const u of studentUids) { const v = grid[u]?.[questionId]; if (v === "right") right++; else if (v === "wrong") wrong++; }
  return { right, wrong };
}
/** Keyboard in the grid: y / r / 1 = right, n / x / w / 2 = wrong, Backspace / Delete / 0 = clear; others → undefined. */
export function keyToMark(key: string): MarkValue | null | undefined {
  const k = key.toLowerCase();
  if (["1", "y", "r"].includes(k)) return "right";
  if (["2", "n", "x", "w"].includes(k)) return "wrong";
  if (["0", "backspace", "delete"].includes(k)) return null;
  return undefined;
}
/** Arrow keys move between cells; stays inside the grid. */
export function moveCell(row: number, col: number, key: string, rows: number, cols: number): [number, number] | null {
  const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  const m = d[key];
  if (!m) return null;
  return [Math.max(0, Math.min(rows - 1, row + m[0])), Math.max(0, Math.min(cols - 1, col + m[1]))];
}

// ---------- analytics formatting ----------
export const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) : 0);
/** Class topic row: completed is summed over students, so the whole is total × students. */
export function classTopicPct(t: { total: number; completed: number; students?: number }): number {
  return pct(t.completed, t.total * Math.max(1, t.students ?? 1));
}
export const TYPE_LABEL: Record<string, string> = { mcq: "Multiple choice", open: "Open-ended" };
export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;
export function typeRows(t: TopicProgress & { students?: number }): { type: string; label: string; completed: number; total: number; pct: number }[] {
  const k = Math.max(1, t.students ?? 1);
  return Object.entries(t.byType)
    .map(([type, v]) => ({ type, label: typeLabel(type), completed: v.completed, total: v.total * k, pct: pct(v.completed, v.total * k) }))
    .sort((a, b) => a.type.localeCompare(b.type));
}
export interface QuestionFilter { topicId?: string; level?: number }
/** The hardest questions first: most students stuck (tried, not completed), then most attempts per student. */
export function hardestQuestions(rows: readonly ClassQuestionRow[], f: QuestionFilter, topicOf: (subtopicId: string) => string | undefined, limit = 25): ClassQuestionRow[] {
  return rows
    .filter((r) => r.totalAttempts > 0 && (!f.topicId || topicOf(r.subtopicId) === f.topicId) && (!f.level || r.level === f.level))
    .sort((a, b) => (b.studentsAttempted - b.studentsCompleted) - (a.studentsAttempted - a.studentsCompleted) || b.avgAttempts - a.avgAttempts || b.totalAttempts - a.totalAttempts || a.questionId.localeCompare(b.questionId))
    .slice(0, limit);
}
/** A student's questions: not completed first, then most attempts. */
export function studentQuestions(rows: readonly QuestionRow[], f: QuestionFilter, topicOf: (subtopicId: string) => string | undefined): QuestionRow[] {
  return rows
    .filter((r) => (!f.topicId || topicOf(r.subtopicId) === f.topicId) && (!f.level || r.level === f.level))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || b.attempts - a.attempts || a.questionId.localeCompare(b.questionId));
}
export const avgLabel = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

// ---------- tasks ----------
export function defaultTaskTitle(kind: "worksheet" | "diagnostic", names: { topic?: string; subtopic?: string }, level?: number): string {
  return kind === "worksheet" ? `Worksheet: ${names.subtopic ?? "?"} · Level ${level ?? "?"}` : `Diagnostic: ${names.topic ?? "?"}`;
}
/** Print order for the questions of a task: letters for parts, "(a)". */
export const partTag = (i: number, part?: string) => `(${part || String.fromCharCode(97 + i)})`;
