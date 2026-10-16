import { describe, expect, it } from "vitest";
import type { PublicProfile } from "../src/shared/index.js";
import { buildBoard, DailyBoardServer, lastBuildAt, PART_SIZE, splitParts, type BoardPlayer, type BoardPointer, type LiveFallback } from "../src/logic/dailyBoard";

const prof = (uid: string, school?: string): PublicProfile => ({ uid, displayName: uid.toUpperCase(), ...(school ? { school } : {}), cat: { colorId: "color-black", hatId: null, name: "Tom" }, grade: "P6" });
const T0 = Date.UTC(2026, 9, 16, 15, 55); // 23:55 SGT 16 Oct

function board(players: Record<string, [number, string?]>, extra: Partial<Parameters<typeof buildBoard>[0]> = {}) {
  const profiles = new Map(Object.entries(players).map(([u, [, s]]) => [u, prof(u, s)] as const));
  const entries = new Map(Object.entries(players).filter(([, [st]]) => st > 0).map(([u, [st]]) => [u, { stars: st, questionsDone: st }] as const));
  return buildBoard({ date: "2026-10-16", month: "2026-10", now: T0, profiles, entries, medals: new Map(), spots: new Map(), previous: null, ...extra });
}

function server(b: ReturnType<typeof buildBoard> | null, clock: { t: number }) {
  const reads = { pointer: 0, parts: 0 };
  let current = b;
  const src = {
    pointer: async (): Promise<BoardPointer | null> => { reads.pointer++; return current && { date: current.date, month: current.month, builtAt: current.builtAt, parts: current.parts, count: current.count, hasPrev: current.hasPrev }; },
    parts: async (): Promise<BoardPlayer[]> => { reads.parts++; return current!.players; },
  };
  return { s: new DailyBoardServer(src, () => clock.t), reads, swap: (n: typeof b) => { current = n; } };
}
const live = (friends: Record<string, string[]> = {}, extraProfiles: PublicProfile[] = []): LiveFallback & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    friendUids: async (u) => friends[u] ?? [],
    profiles: async (uids) => { calls.push(`profiles:${uids.join(",")}`); return new Map(extraProfiles.filter((p) => uids.includes(p.uid)).map((p) => [p.uid, p] as const)); },
    spots: async (uids) => { calls.push(`spots:${uids.join(",")}`); return {}; },
  };
};

describe("lastBuildAt", () => {
  it("is 15:55 UTC today, or yesterday before that", () => {
    expect(lastBuildAt(T0)).toBe(T0);
    expect(lastBuildAt(T0 + 3600_000)).toBe(T0);
    expect(lastBuildAt(T0 - 60_000)).toBe(T0 - 86_400_000);
  });
});

describe("buildBoard", () => {
  it("sorts players, flags ranked ones and keeps yesterday's stars only within the same month", () => {
    const b = board({ a: [5], b: [9], c: [0] }, { previous: { month: "2026-10", players: [{ uid: "a", stars: 7, questionsDone: 0, ranked: true }] } });
    expect(b.players.map((p) => p.uid)).toEqual(["b", "a", "c"]);
    expect(b.players.map((p) => p.ranked)).toEqual([true, true, false]);
    expect(b.hasPrev).toBe(true);
    expect(b.players.find((p) => p.uid === "a")!.prev).toBe(7);
    const nb = board({ a: [5] }, { previous: { month: "2026-09", players: [{ uid: "a", stars: 7, questionsDone: 0, ranked: true }] } });
    expect(nb.hasPrev).toBe(false);
    expect(nb.players[0].prev).toBeUndefined();
  });
  it("splits into parts of PART_SIZE", () => {
    const many = Array.from({ length: PART_SIZE * 2 + 1 }, (_, i) => ({ uid: `u${i}`, stars: 0, questionsDone: 0, ranked: false }));
    expect(splitParts(many).map((p) => p.length)).toEqual([PART_SIZE, PART_SIZE, 1]);
    expect(splitParts([])).toEqual([[]]);
  });
});

describe("DailyBoardServer", () => {
  it("returns null with no board (caller falls back to live)", async () => {
    const { s } = server(null, { t: T0 + 1000 });
    expect(await s.leaderboard("a", "global", live())).toBeNull();
  });

  it("loads once and reads nothing more until the next build is due", async () => {
    const clock = { t: T0 + 60_000 };
    const { s, reads, swap } = server(board({ a: [5], b: [9] }), clock);
    for (let i = 0; i < 50; i++) await s.leaderboard("a", "global", live());
    expect(reads).toEqual({ pointer: 1, parts: 1 });
    clock.t = T0 + 20 * 3600_000; // still the same day
    await s.leaderboard("a", "friends", live());
    expect(reads).toEqual({ pointer: 1, parts: 1 });
    // next build at T0+24h; we look 3 minutes later
    const next = { ...board({ a: [20], b: [9] }), date: "2026-10-17", builtAt: T0 + 86_400_000 };
    swap(next);
    clock.t = T0 + 86_400_000 + 4 * 60_000;
    const r = await s.leaderboard("a", "global", live());
    expect(reads).toEqual({ pointer: 2, parts: 2 });
    expect(r!.entries[0]).toMatchObject({ uid: "a", stars: 20, rank: 1 });
    expect(r!.updatedAt).toBe(T0 + 86_400_000);
  });

  it("retries every 15 minutes when the build is late, without reloading parts", async () => {
    const clock = { t: T0 + 86_400_000 + 4 * 60_000 }; // the next build is due but has not happened
    const { s, reads } = server(board({ a: [5] }), clock);
    await s.leaderboard("a", "global", live());
    clock.t += 10 * 60_000;
    await s.leaderboard("a", "global", live());
    expect(reads).toEqual({ pointer: 1, parts: 1 });
    clock.t += 6 * 60_000;
    await s.leaderboard("a", "global", live());
    expect(reads).toEqual({ pointer: 2, parts: 1 });
  });

  it("global: top rows plus the caller with their real rank when outside", async () => {
    const players: Record<string, [number]> = {};
    for (let i = 0; i < 120; i++) players[`p${String(i).padStart(3, "0")}`] = [1000 - i];
    players.me = [1];
    const { s } = server(board(players), { t: T0 + 1 });
    const r = await s.leaderboard("me", "global", live());
    expect(r!.entries).toHaveLength(101);
    expect(r!.entries[100]).toMatchObject({ uid: "me", rank: 121, stars: 1 });
    const z = await s.leaderboard("nobody", "global", live());
    expect(z!.entries[100]).toMatchObject({ uid: "nobody", rank: 122, stars: 0 });
  });

  it("school: everyone with the caller's school; friends: caller + friends with live profiles for newcomers", async () => {
    const { s } = server(board({ a: [5, "X"], b: [9, "X"], c: [7, "Y"] }), { t: T0 + 1 });
    const sch = await s.leaderboard("a", "school", live());
    expect(sch!.entries.map((e) => e.uid)).toEqual(["b", "a"]);
    const l = live({ a: ["c", "new"] }, [prof("new")]);
    const fr = await s.leaderboard("a", "friends", l);
    expect(fr!.entries.map((e) => [e.uid, e.stars])).toEqual([["c", 7], ["a", 5], ["new", 0]]);
    expect(fr!.friends.map((p) => p.uid)).toEqual(["c", "new"]);
    expect(l.calls).toEqual(["profiles:new", "spots:new"]);
  });

  it("rank arrows compare with yesterday's board", async () => {
    const b = board({ a: [10], b: [8] }, { previous: { month: "2026-10", players: [{ uid: "a", stars: 1, questionsDone: 0, ranked: true }, { uid: "b", stars: 5, questionsDone: 0, ranked: true }] } });
    const { s } = server(b, { t: T0 + 1 });
    const r = await s.leaderboard("a", "global", live());
    expect(r!.entries.map((e) => [e.uid, e.rankDelta])).toEqual([["a", 1], ["b", -1]]);
  });
});
