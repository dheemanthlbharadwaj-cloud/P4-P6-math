// Placing things on a topic map page without covering each other: name labels, friends' cats and the student's cat.
// Positions are in page points; a button's `pos` is its centre x and its top y (as TopicMapPage draws it).

export interface Rect { x: number; y: number; w: number; h: number }

export const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** First candidate that overlaps nothing; otherwise the one with the least overlap. */
export function pickRect(cands: Rect[], taken: Rect[]): Rect {
  let best = cands[0], bestArea = Infinity;
  for (const c of cands) {
    const area = taken.reduce((t, r) => t + overlap(c, r), 0);
    if (area === 0) return c;
    if (area < bestArea) { best = c; bestArea = area; }
  }
  return best;
}

/** The area a button covers (a little margin so nothing touches it). */
export const nodeRect = (p: { x: number; y: number }, node: number): Rect => ({ x: p.x - node / 2 - 2, y: p.y - 2, w: node + 4, h: node + 4 });

// The student's cat (CatAvatar, 78pt wide, 72pt tall): the drawn cat fills x 16–68 of that box, and a hat can rise
// ~14pt above it.
export const CAT = { size: 78, h: 72, inX: 16, inW: 52, hat: 14 };

/**
 * Where the student's cat stands for button `idx`: beside it (right or left, a little raised), else above or below,
 * never over any button. Returns the cat box's top-left and the area the visible cat covers.
 */
export function placeCat(pos: { x: number; y: number }[], idx: number, node: number, width: number): { x: number; y: number; covers: Rect } {
  const p = pos[idx];
  const buttons = pos.map((q) => nodeRect(q, node));
  const visible = (bx: number, by: number): Rect => ({ x: bx + CAT.inX, y: by - CAT.hat, w: CAT.inW, h: CAT.h + CAT.hat });
  const right = p.x + node / 2 + 2 - CAT.inX, left = p.x - node / 2 - 2 - CAT.inX - CAT.inW;
  const boxes: [number, number][] = [];
  for (const dy of [-24, -12, -36, 0, -48]) boxes.push([right, p.y + dy], [left, p.y + dy]);
  boxes.push([p.x - CAT.size / 2, p.y - CAT.h - 4], [p.x - CAT.size / 2, p.y + node + 4 + CAT.hat]);
  // crowded spots: the nearest clear place around the button
  const grid: [number, number][] = [];
  for (let dx = -140; dx <= 140; dx += 6) for (let dy = -130; dy <= 90; dy += 6) grid.push([p.x + dx - CAT.inX - CAT.inW / 2, p.y + dy]);
  const far = ([bx, by]: [number, number]) => Math.hypot(bx + CAT.inX + CAT.inW / 2 - p.x, by + CAT.h / 2 - (p.y + node / 2));
  boxes.push(...grid.sort((a, b) => far(a) - far(b)));
  const cands = boxes
    .map(([bx, by]) => [Math.min(width - CAT.inX - CAT.inW, Math.max(-CAT.inX, bx)), by] as [number, number])
    .map(([bx, by]) => ({ bx, by, r: visible(bx, by) }));
  const best = pickRect(cands.map((c) => c.r), buttons);
  const c = cands.find((k) => k.r === best)!;
  return { x: c.bx, y: c.by, covers: c.r };
}
