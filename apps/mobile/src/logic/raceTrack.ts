// Race track on the leaderboard: the student and their friends as cats on one track. Left = fewest stars, right = most;
// the distance between two cats is proportional to the difference in their stars. The track is wide enough that about
// 5 cats fit on the screen at once (it scrolls sideways when there are more). Cats too close to stand side by side
// (ties, near-ties) go into stacked lanes.

export interface Racer { uid: string; stars: number }
export interface Placed extends Racer { x: number; lane: number } // x = cat centre, lane 0 = on the track

export const VISIBLE = 5;

export function layoutTrack(racers: Racer[], viewport: number, catWidth: number, maxLanes = 3): { placed: Placed[]; width: number; lanes: number } {
  const pad = catWidth * 0.75;
  if (!racers.length) return { placed: [], width: viewport, lanes: 1 };
  const sorted = [...racers].sort((a, b) => a.stars - b.stars || a.uid.localeCompare(b.uid));
  const lo = sorted[0].stars, hi = sorted[sorted.length - 1].stars;
  // Span so that, on average, VISIBLE cats share one screen; never narrower than the screen itself.
  const span = Math.max(viewport - 2 * pad, ((sorted.length - 1) * (viewport - 2 * pad)) / (VISIBLE - 1));
  const at = (s: number) => pad + (hi === lo ? span / 2 : ((s - lo) / (hi - lo)) * span);
  const gap = catWidth * 0.95;
  const laneEnd: number[] = [];
  const placed = sorted.map((r) => {
    const x = at(r.stars);
    let lane = laneEnd.findIndex((end) => x - end >= gap);
    if (lane === -1) lane = laneEnd.length < maxLanes ? laneEnd.length : laneEnd.indexOf(Math.min(...laneEnd));
    laneEnd[lane] = x;
    return { ...r, x, lane };
  });
  return { placed, width: span + 2 * pad, lanes: Math.max(1, laneEnd.length) };
}
