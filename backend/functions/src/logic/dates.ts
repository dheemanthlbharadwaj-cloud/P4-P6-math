// SGT (Asia/Singapore, UTC+8, no DST) date math. Pure.
const SGT_OFFSET_MS = 8 * 3600_000;

/** Calendar parts of `ms` as seen in Singapore. */
export function sgtParts(ms: number): { y: number; m: number; d: number } {
  const t = new Date(ms + SGT_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
const p2 = (n: number) => String(n).padStart(2, "0");

/** yyyy-mm-dd in SGT */
export function sgtDate(ms: number): string {
  const { y, m, d } = sgtParts(ms);
  return `${y}-${p2(m)}-${p2(d)}`;
}
/** yyyy-mm in SGT */
export function sgtMonth(ms: number): string {
  const { y, m } = sgtParts(ms);
  return `${y}-${p2(m)}`;
}
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function isLastDayOfMonthSGT(ms: number): boolean {
  const { y, m, d } = sgtParts(ms);
  return d === daysInMonth(y, m);
}
/** "2026-01" → "2025-12" */
export function previousMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${p2(m - 1)}`;
}
/** "2025-12" → "2026-01" */
export function nextMonthKey(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${p2(m + 1)}`;
}
/** UTC ms of 00:00 SGT on the first day after `ym`'s last day. */
export function monthEndInstantSGT(ym: string): number {
  const [y, m] = nextMonthKey(ym).split("-").map(Number);
  return Date.UTC(y, m - 1, 1) - SGT_OFFSET_MS;
}
/** Shift a yyyy-mm-dd calendar date by whole days. "2026-03-01", -1 → "2026-02-28" */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${p2(t.getUTCMonth() + 1)}-${p2(t.getUTCDate())}`;
}
export const previousDate = (date: string) => shiftDate(date, -1);

/**
 * Which timestamp a (possibly offline-queued) level result counts toward. Uses the client's finishedAt if it is
 * plausible (not in the future, not older than 7 days) AND still in the current SGT month (closed months are
 * final); otherwise the server time.
 */
export function effectiveResultTime(finishedAt: number, now: number): number {
  if (!Number.isFinite(finishedAt)) return now;
  if (finishedAt > now + 5 * 60_000) return now;
  if (finishedAt < now - 7 * 86400_000) return now;
  if (sgtMonth(finishedAt) !== sgtMonth(now)) return now;
  return finishedAt;
}
