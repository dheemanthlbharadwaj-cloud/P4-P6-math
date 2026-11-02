// Small pure helpers for the teacher and parent screens (tested in format.test.ts).
import { FACES, type Face, type LessonReport } from "@p6/shared";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const formatDay = (ts: number) => { const d = new Date(ts); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
/** <input>-style "YYYY-MM-DD" for a day, and back (local time, noon so time zones never shift the day). */
export const toDayInput = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export function fromDayInput(s: string): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d.getTime() : null;
}
export const faceEmoji = (f: Face | undefined) => FACES.find((x) => x.id === f)?.emoji ?? "–";
export const faceLabel = (f: Face | undefined) => FACES.find((x) => x.id === f)?.label ?? "Not rated";

/** A child's lesson history in numbers: lessons, and how many :) :| :( over all learning goals. */
export function childSummary(reports: readonly Pick<LessonReport, "goals" | "lessonId">[]) {
  const faces: Record<Face, number> = { good: 0, ok: 0, bad: 0 };
  for (const r of reports) for (const f of Object.values(r.goals)) faces[f]++;
  return { lessons: reports.length, distinctLessons: new Set(reports.map((r) => r.lessonId)).size, faces };
}

/** Group report rows by lesson session (newest first): the parent view shows one card per lesson day. */
export function bySession<T extends Pick<LessonReport, "sessionId" | "date">>(rows: readonly T[]): { sessionId: string; date: number; rows: T[] }[] {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r.sessionId, [...(m.get(r.sessionId) ?? []), r]);
  return [...m.entries()].map(([sessionId, rs]) => ({ sessionId, date: rs[0].date, rows: rs })).sort((a, b) => b.date - a.date);
}
