// (Copied from the game's backend.) In-memory request limits per account and function (fixed one-minute windows). They live in one server instance,
// so they slow down a script hammering the API without costing a database read or write per request; the edge
// limit per IP (backend/netlify/functions/api.mjs) holds across instances. Pure apart from the clock.

/** Requests per minute per account, per function (everything else: DEFAULT_PER_MINUTE). */
export const PER_MINUTE: Record<string, number> = {
  getMyRoles: 30, adminGetOverview: 30, adminSaveTeacher: 20, adminSetTeacherActive: 20, adminResetAccessCode: 10,
  teacherGetStudents: 30, teacherSaveFamily: 30, teacherResetFamilyCode: 10, teacherDeleteFamily: 10, teacherGetChild: 60, teacherListLessons: 30,
  teacherSaveLesson: 30, teacherDeleteLesson: 10, teacherSaveSession: 30,
  // parentSignIn / codeSignIn run signed out, so it is limited per IP: guessing codes is hopeless at 5 a minute
  parentSignIn: 5, codeSignIn: 5, parentGetHome: 20,
};
export const DEFAULT_PER_MINUTE = 20;
/** Every function together, per account. */
export const TOTAL_PER_MINUTE = 120;
const WINDOW_MS = 60_000;
const MAX_KEYS = 20_000; // memory bound: the oldest windows are dropped first

export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  constructor(private now: () => number = Date.now) {}

  private hit(key: string, limit: number): boolean {
    const t = this.now();
    const w = this.windows.get(key);
    if (!w || t - w.start >= WINDOW_MS) {
      if (this.windows.size >= MAX_KEYS) this.windows.delete(this.windows.keys().next().value!);
      this.windows.delete(key); // re-insert so the Map's order stays oldest-first
      this.windows.set(key, { start: t, count: 1 });
      return true;
    }
    w.count++;
    return w.count <= limit;
  }

  /** true = allowed. Counts the call against the account's total and the function's own limit. */
  allow(uid: string, fn: string): boolean {
    const total = this.hit(`u:${uid}`, TOTAL_PER_MINUTE);
    const own = this.hit(`f:${uid}:${fn}`, PER_MINUTE[fn] ?? DEFAULT_PER_MINUTE);
    return total && own;
  }
}
