// Pure helpers for the student side of the classroom feature (feed, tasks, homework). No React, no network.
import type { ClassPost, ClassTask, MarkValue, PostAttachment, PostKind } from "@p6/shared";

/** Same shape as the getMyClassroom response (packages/shared/src/classroom.ts, "Student callables"). */
export interface MyClassroom {
  classes: { id: string; name: string; teacherName: string }[];
  posts: ClassPost[];
  tasks: ClassTask[];
  homework: string[];
}
export const EMPTY_CLASSROOM: MyClassroom = { classes: [], posts: [], tasks: [], homework: [] };

/** getMyClassroom is fetched on focus, but at most this often (reads are limited). */
export const CLASSROOM_TTL_MS = 2 * 60 * 1000;

export function shouldRefetch(fetchedAt: number | undefined, now: number, force = false): boolean {
  if (force || !fetchedAt) return true;
  return now - fetchedAt >= CLASSROOM_TTL_MS || fetchedAt > now; // (a clock set back also refetches)
}

/** "You're not in any class": nothing at all came back. */
export function isNotInClass(c: MyClassroom): boolean {
  return c.classes.length === 0 && c.posts.length === 0 && c.tasks.length === 0 && c.homework.length === 0;
}

/** Newest first, one entry per post id. */
export function sortFeed(posts: readonly ClassPost[]): ClassPost[] {
  const seen = new Set<string>();
  return [...posts]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

const POST_ICON: Record<PostKind, string> = { teacher: "📣", milestone: "⭐", birthday: "🎂" };
export const postIcon = (kind: PostKind): string => POST_ICON[kind] ?? "📣";

export function postLabel(kind: PostKind): string {
  return kind === "teacher" ? "From your teacher" : kind === "milestone" ? "Class news" : "Birthday";
}

export function attachmentIcon(kind: PostAttachment["kind"]): string {
  return kind === "pdf" ? "📄" : kind === "image" ? "🖼️" : "🔗";
}

/** Only web links are opened from a post. */
export function safeUrl(url: string): string | null {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Short, kid-friendly time: Today, Yesterday, 3 days ago, then "12 Oct". */
export function formatPostTime(ts: number, now: number): string {
  const d = new Date(ts), n = new Date(now);
  const day = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
  const diff = Math.round((day(n) - day(d)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff} days ago`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const formatDue = (ts: number): string => `${new Date(ts).getDate()} ${MONTHS[new Date(ts).getMonth()]}`;

export const isTakeableTest = (t: ClassTask): boolean => t.kind === "diagnostic" && t.inApp && t.questionIds.length > 0;

/** "Worksheet from your teacher: Fractions · Level 1". `subtopicName` resolves the level's subtopic from the content. */
export function worksheetLabel(t: ClassTask, subtopicName: (id: string) => string | undefined): string {
  const name = (t.subtopicId && subtopicName(t.subtopicId)) || t.title;
  return `Worksheet from your teacher: ${name}${t.level ? ` · Level ${t.level}` : ""}`;
}

export interface TaskGroups { tests: ClassTask[]; paper: ClassTask[] }
/** Tests the student can take in the app (newest first), and paper tasks (worksheets, tests done on paper) that are info only. */
export function groupTasks(tasks: readonly ClassTask[]): TaskGroups {
  const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
  return { tests: sorted.filter(isTakeableTest), paper: sorted.filter((t) => !isTakeableTest(t)) };
}

/**
 * Questions for the Homework run: what the teacher marked wrong, minus those answered right here since the last
 * getMyClassroom, only ones this app build has (a retired/unknown id can't be shown), once each, in the teacher's order.
 */
export function homeworkIds(homework: readonly string[], have: (id: string) => boolean, doneLocally: ReadonlySet<string> | readonly string[] = []): string[] {
  const done = doneLocally instanceof Set ? doneLocally : new Set(doneLocally);
  return [...new Set(homework)].filter((id) => !done.has(id) && have(id));
}

export function scoreOf(marks: Record<string, MarkValue>): { right: number; total: number } {
  const v = Object.values(marks);
  return { right: v.filter((m) => m === "right").length, total: v.length };
}
export const scoreText = (s: { right: number; total: number }): string => `${s.right} out of ${s.total}`;

/** Cheer for the test summary (score only; never which answers were wrong). */
export function scoreCheer(s: { right: number; total: number }): string {
  if (s.total === 0) return "All done!";
  const f = s.right / s.total;
  return f === 1 ? "Perfect! Amazing work!" : f >= 0.7 ? "Great job!" : f >= 0.4 ? "Good try! Keep practising." : "Thanks for trying. Your teacher will help you.";
}
