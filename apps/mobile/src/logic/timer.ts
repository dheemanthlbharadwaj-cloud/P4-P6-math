// The cat's board clock (CatTimer): one full circle = 5 minutes, then it stays full.
export const TIMER_MS = 5 * 60_000;

/** Fraction of the timer elapsed, clamped to 0..1 (never loops). */
export function timerProgress(startedAt: number, now: number, total = TIMER_MS): number {
  return Math.max(0, Math.min(1, (now - startedAt) / total));
}

/** SVG path of a pie wedge from 12 o'clock, clockwise, covering `p` (0..1) of the circle. */
export function wedgePath(cx: number, cy: number, r: number, p: number): string {
  if (p <= 0) return "";
  const a = 2 * Math.PI * Math.min(p, 0.9999);
  const x = cx + r * Math.sin(a), y = cy - r * Math.cos(a);
  return `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
}
