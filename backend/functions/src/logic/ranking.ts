// Leaderboard ranking + rank deltas. Pure.
import type { CatLook, LeaderboardEntry } from "../shared/index.js";

export interface Row {
  uid: string;
  stars: number; // monthly stars
  questionsDone: number;
}

/** stars desc, then questionsDone desc, then uid asc → stable, deterministic order. */
export function sortRows<T extends Row>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.stars - a.stars || b.questionsDone - a.questionsDone || (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
}

/** uid → 1-based rank among exactly this set. */
export function rankMap(rows: Row[]): Map<string, number> {
  const m = new Map<string, number>();
  sortRows(rows).forEach((r, i) => m.set(r.uid, i + 1));
  return m;
}

/**
 * rankDelta per uid: +n rose / -n fell versus the snapshot. `prevStars` is the snapshot (uid → monthly stars at the
 * last midnight); missing uids count as 0 stars. With no snapshot at all, every delta is 0.
 */
export function rankDeltas(current: Row[], prevStars: Map<string, number> | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!prevStars) { current.forEach((r) => out.set(r.uid, 0)); return out; }
  const cur = rankMap(current);
  // previous questionsDone is unknown; tie-break by uid only so ties are stable
  const prev = rankMap(current.map((r) => ({ uid: r.uid, stars: prevStars.get(r.uid) ?? 0, questionsDone: 0 })));
  for (const r of current) out.set(r.uid, prev.get(r.uid)! - cur.get(r.uid)!);
  return out;
}

export interface ProfileLite { displayName: string; school?: string; cat: CatLook }
export type Medal = "gold" | "silver" | "bronze";

export function buildEntries(
  rows: Row[],
  opts: { prevStars: Map<string, number> | null; profiles: Map<string, ProfileLite>; medals: Map<string, Medal>; startRank?: number },
): LeaderboardEntry[] {
  const sorted = sortRows(rows);
  const deltas = rankDeltas(sorted, opts.prevStars);
  const start = opts.startRank ?? 1;
  return sorted.map((r, i) => {
    const p = opts.profiles.get(r.uid);
    const e: LeaderboardEntry = {
      uid: r.uid,
      displayName: p?.displayName ?? "Player",
      ...(p?.school ? { school: p.school } : {}),
      cat: p ? { colorId: p.cat.colorId, hatId: p.cat.hatId ?? null } : { colorId: "color-black", hatId: null },
      stars: r.stars,
      questionsDone: r.questionsDone,
      rank: start + i,
      rankDelta: deltas.get(r.uid) ?? 0,
    };
    const medal = opts.medals.get(r.uid);
    if (medal) e.medal = medal;
    return e;
  });
}

/** Winners of a closed month: top 3 with stars > 0. */
export function pickMedalWinners(rows: Row[]): { uid: string; medal: Medal; stars: number }[] {
  const medals: Medal[] = ["gold", "silver", "bronze"];
  return sortRows(rows.filter((r) => r.stars > 0)).slice(0, 3).map((r, i) => ({ uid: r.uid, medal: medals[i], stars: r.stars }));
}
