// The daily leaderboard: built ONCE a day at 23:55 SGT and served from memory, so a leaderboard view costs no Firestore
// reads for other players (only the caller's friend list, cached 60 s). Pure of firebase-admin: reads/writes go through
// `BoardStore` / `BoardSource`, so tests can count them with fakes.
//
//   build (23:55 SGT):  every public profile + every monthly entry + medals + progress (friend spots) + yesterday's board
//                       → leaderboardDaily/{date}/parts/{i} (≤ PART_SIZE players each) and leaderboardDaily/current.
//   serve:              an instance loads the board once (1 + parts reads) and keeps it until the next build is due;
//                       then it reads the pointer (1 read) and reloads only when a newer board exists (else retries in 15 min).
//
// Everything on the board, the caller's own row included, is as of the last build: stars earned today show after 23:55.
// Players who joined after the build get 0 stars; their profile and map spot are read live (cached) so new friends
// still appear on the maps.
import type { GetLeaderboardResponse, LeaderboardScope, PublicProfile } from "../shared/index.js";
import { buildEntries, sortRows, type Medal, type Row } from "./ranking.js";

export const PART_SIZE = 1000; // ~0.5 KB per player → ~0.5 MB per document (limit 1 MB)
export const BUILD_UTC_HOUR = 15; // 15:55 UTC = 23:55 SGT
export const BUILD_UTC_MINUTE = 55;
export const RETRY_MS = 15 * 60_000;
const DAY_MS = 86_400_000;
const MAX_SCHOOL = 200;
const TOP_N = 100;

export interface BoardPlayer {
  uid: string;
  stars: number;
  questionsDone: number;
  /** has a monthly entry (is ranked on the global board) */
  ranked: boolean;
  /** monthly stars on the previous day's board (rank arrows); absent = 0 */
  prev?: number;
  profile?: PublicProfile;
  medal?: Medal;
  spots?: Record<string, string>;
}
export interface BoardPointer { date: string; month: string; builtAt: number; parts: number; count: number; hasPrev: boolean }
export interface DailyBoard extends BoardPointer { players: BoardPlayer[] }

/** The most recent scheduled build instant at or before `now`. */
export function lastBuildAt(now: number): number {
  const d = new Date(now);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), BUILD_UTC_HOUR, BUILD_UTC_MINUTE);
  return t <= now ? t : t - DAY_MS;
}

// ---------- build ----------
export interface BuildInput {
  date: string;
  month: string;
  now: number;
  profiles: Map<string, PublicProfile>;
  entries: Map<string, { stars: number; questionsDone: number }>;
  medals: Map<string, Medal>;
  spots: Map<string, Record<string, string>>;
  /** the previous board, used for rank arrows when it is from the same month */
  previous: { month: string; players: BoardPlayer[] } | null;
}
export function buildBoard(i: BuildInput): DailyBoard {
  const prevSame = i.previous && i.previous.month === i.month ? new Map(i.previous.players.map((p) => [p.uid, p.stars] as const)) : null;
  const uids = [...new Set([...i.profiles.keys(), ...i.entries.keys()])];
  const players = uids.map((uid): BoardPlayer => {
    const e = i.entries.get(uid);
    const p: BoardPlayer = { uid, stars: e?.stars ?? 0, questionsDone: e?.questionsDone ?? 0, ranked: !!e };
    const prev = prevSame?.get(uid);
    if (prev) p.prev = prev;
    const profile = i.profiles.get(uid);
    if (profile) p.profile = profile;
    const medal = i.medals.get(uid);
    if (medal) p.medal = medal;
    const s = i.spots.get(uid);
    if (s && Object.keys(s).length) p.spots = s;
    return p;
  });
  const sorted = sortRows(players);
  return { date: i.date, month: i.month, builtAt: i.now, parts: Math.max(1, Math.ceil(sorted.length / PART_SIZE)), count: sorted.length, hasPrev: !!prevSame, players: sorted };
}
export function splitParts(players: BoardPlayer[]): BoardPlayer[][] {
  const out: BoardPlayer[][] = [];
  for (let k = 0; k < players.length; k += PART_SIZE) out.push(players.slice(k, k + PART_SIZE));
  return out.length ? out : [[]];
}

// ---------- serve ----------
export interface BoardSource {
  pointer(): Promise<BoardPointer | null>;
  parts(p: BoardPointer): Promise<BoardPlayer[]>;
}
/** What the board can't answer for people who joined after the build (live, cached by the caller). */
export interface LiveFallback {
  friendUids(uid: string): Promise<string[]>;
  profiles(uids: string[]): Promise<Map<string, PublicProfile>>;
  spots(uids: string[], gradeOf: (u: string) => PublicProfile["grade"]): Promise<Record<string, Record<string, string>>>;
}

export class DailyBoardServer {
  private board: (DailyBoard & { byUid: Map<string, BoardPlayer> }) | null = null;
  private checkAfter = 0;
  private loading: Promise<void> | null = null;

  constructor(private source: BoardSource, private now: () => number = Date.now) {}

  /** A deleted account: drop it from this instance's copy. */
  forget(uid: string): void {
    if (!this.board) return;
    this.board.players = this.board.players.filter((p) => p.uid !== uid);
    this.board.byUid.delete(uid);
  }

  /** The current board, or null when none was ever built (callers fall back to the live leaderboard). */
  async current(): Promise<DailyBoard & { byUid: Map<string, BoardPlayer> } | null> {
    if (this.now() >= this.checkAfter) {
      this.loading ??= this.refresh().finally(() => { this.loading = null; });
      await this.loading;
    }
    return this.board;
  }

  private async refresh(): Promise<void> {
    const now = this.now();
    const p = await this.source.pointer();
    if (p && (!this.board || p.date !== this.board.date || p.builtAt !== this.board.builtAt)) {
      const players = await this.source.parts(p);
      this.board = { ...p, players, byUid: new Map(players.map((x) => [x.uid, x] as const)) };
    }
    const due = lastBuildAt(now);
    // Up to date (built at/after the latest scheduled build): next look after the next build. Else (late/failed build) retry.
    this.checkAfter = this.board && this.board.builtAt >= due - 5 * 60_000 ? due + DAY_MS + 3 * 60_000 : now + RETRY_MS;
  }

  async leaderboard(uid: string, scope: LeaderboardScope, live: LiveFallback): Promise<GetLeaderboardResponse | null> {
    const b = await this.current();
    if (!b) return null;
    const friendUids = await live.friendUids(uid);
    const get = (u: string) => b.byUid.get(u);

    // profiles: from the board; people missing from it (joined after the build) read live
    const wanted = [...new Set([uid, ...friendUids])];
    const missing = wanted.filter((u) => !get(u)?.profile);
    const liveProfiles = missing.length ? await live.profiles(missing) : new Map<string, PublicProfile>();
    const profileOf = (u: string) => get(u)?.profile ?? liveProfiles.get(u);

    const rowOf = (u: string): Row => ({ uid: u, stars: get(u)?.stars ?? 0, questionsDone: get(u)?.questionsDone ?? 0 });
    let rows: Row[];
    let tail: Row | null = null;
    let tailRank = 0;
    if (scope === "friends") rows = [uid, ...friendUids].map(rowOf);
    else if (scope === "school") {
      const school = profileOf(uid)?.school?.trim();
      const mates = school ? b.players.filter((p) => p.profile?.school?.trim() === school) : [];
      rows = mates.slice(0, MAX_SCHOOL).map((p) => rowOf(p.uid)); // players are stored sorted: the top 200 of the school
      if (!rows.some((r) => r.uid === uid)) rows.push(rowOf(uid));
    } else {
      const ranked = b.players.filter((p) => p.ranked);
      rows = ranked.slice(0, TOP_N).map((p) => rowOf(p.uid));
      if (!rows.some((r) => r.uid === uid)) {
        tail = rowOf(uid);
        const before = (p: BoardPlayer) => sortRows([p, tail!])[0] === p; // p ranks above the caller
        tailRank = ranked.filter((p) => p.uid !== uid && before(p)).length + 1;
      }
    }

    const all = [...new Set([...rows.map((r) => r.uid), ...(tail ? [tail.uid] : [])])];
    const profiles = new Map<string, PublicProfile>();
    const medals = new Map<string, Medal>();
    const prevStars = b.hasPrev ? new Map<string, number>() : null;
    for (const u of new Set([...all, ...wanted])) {
      const p = profileOf(u);
      if (p) profiles.set(u, p);
      const m = get(u)?.medal;
      if (m) medals.set(u, m);
      prevStars?.set(u, get(u)?.prev ?? 0);
    }
    const entries = buildEntries(rows, { prevStars, profiles, medals });
    if (tail) entries.push(...buildEntries([tail], { prevStars, profiles, medals, startRank: tailRank }));

    let friendSpots: Record<string, Record<string, string>> | undefined;
    if (scope === "friends") {
      friendSpots = {};
      const notOnBoard: string[] = [];
      for (const u of friendUids) {
        const s = get(u);
        if (!s) notOnBoard.push(u);
        else if (s.spots) friendSpots[u] = s.spots;
      }
      if (notOnBoard.length) Object.assign(friendSpots, await live.spots(notOnBoard, (u) => profileOf(u)?.grade ?? profileOf(uid)?.grade ?? "P6"));
    }
    return {
      scope, periodKey: b.month, selfUid: uid, friendUids,
      friends: friendUids.map((u) => profiles.get(u)).filter((p): p is PublicProfile => !!p),
      entries,
      ...(friendSpots ? { friendSpots } : {}),
      updatedAt: b.builtAt,
    };
  }
}
