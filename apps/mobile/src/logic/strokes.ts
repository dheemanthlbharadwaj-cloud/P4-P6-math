// Pure helpers for the scratchpad: stroke model, smooth SVG path building and stroke-level erasing.
export interface Pt { x: number; y: number }
export interface Stroke { id: number; color: string; width: number; points: Pt[] }

/** Smooth path through the points using quadratic curves between midpoints. */
export function strokePath(points: Pt[]): string {
  if (points.length === 0) return "";
  const f = (n: number) => Math.round(n * 10) / 10;
  const [p0] = points;
  if (points.length === 1) return `M${f(p0.x)} ${f(p0.y)} L${f(p0.x + 0.01)} ${f(p0.y)}`;
  let d = `M${f(p0.x)} ${f(p0.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    d += ` Q${f(a.x)} ${f(a.y)} ${f((a.x + b.x) / 2)} ${f((a.y + b.y) / 2)}`;
  }
  const last = points[points.length - 1];
  return d + ` L${f(last.x)} ${f(last.y)}`;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when the eraser at `p` (radius r) touches the stroke (its line width counts too). */
export function strokeTouched(s: Stroke, p: Pt, r: number): boolean {
  const reach = r + s.width / 2;
  if (s.points.length === 1) return Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= reach;
  for (let i = 1; i < s.points.length; i++) if (distToSegment(p, s.points[i - 1], s.points[i]) <= reach) return true;
  return false;
}

/** Remove every stroke the eraser touches. Returns the same array when nothing was hit. */
export function eraseAt(strokes: Stroke[], p: Pt, r: number): Stroke[] {
  const keep = strokes.filter((s) => !strokeTouched(s, p, r));
  return keep.length === strokes.length ? strokes : keep;
}
