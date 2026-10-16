// Leaderboard + friends data with per-instance caches (Firestore reads are the scarce resource: one getLeaderboard used to cost
// ~6F+4 reads). Pure of firebase-admin: the reads go through `LbStore`, so tests can count them with a fake.
//
//   - public profiles, medals, last-midnight snapshot stars, other users' monthly entries: 120 s per user
//   - global top-100 rows 120 s per month; "how many are ahead of me" 120 s per (month, stars)
//   - school mates (the school query, which also warms the profile cache): 120 s per school, 200 schools (LRU)
//   - friend spots (progress docs): 5 min per friend and grade
//   - the caller's friendships (with createdAt, also used by the daily quests): 60 s per uid; dropped on friend changes
//   - the CALLER's own monthly entry (and, in the school scope, own profile) is always read fresh: stars just earned show at once
// Other users' rows may be up to 2 minutes stale. Caches are per instance (several instances: each warms its own).
import type { GetLeaderboardResponse, Grade, LeaderboardScope, PublicProfile } from "../shared/index.js";
import { computeFriendSpots } from "./friendSpots.js";
import { buildEntries, sortRows, type Medal, type Row } from "./ranking.js";
import type { LiveFallback } from "./dailyBoard.js";
import { TtlCache } from "./ttlCache.js";

export const MAX_FRIENDS = 100;
export const MAX_SCHOOL = 200;
export const TOP_N = 100;
export const SHARED_TTL_MS = 120_000;
export const SPOTS_TTL_MS = 5 * 60_000;
export const FRIENDS_TTL_MS = 60_000;

export interface Friendship { uid: string; createdMs: number }
export type Levels = Record<string, { completed?: boolean } | undefined>;
type Entry = { stars: number; questionsDone: number };

/** The Firestore reads. Each returns only documents that exist. */
export interface LbStore {
  friendships(uid: string): Promise<Friendship[]>;
  profiles(uids: string[]): Promise<Map<string, PublicProfile>>;
  medals(uids: string[]): Promise<Map<string, Medal>>;
  snapshot(date: string, uids: string[]): Promise<Map<string, number>>;
  entries(month: string, uids: string[]): Promise<Map<string, Entry>>;
  topRows(month: string): Promise<Row[]>;
  aheadCount(month: string, stars: number): Promise<number>;
  schoolMates(school: string): Promise<Map<string, PublicProfile>>;
  progress(grade: Grade, uids: string[]): Promise<Map<string, Levels | undefined>>;
}

export interface LbClock { now: () => number; date: (ms: number) => string; month: (ms: number) => string }
type Topics = (grade: string) => { id: string; subtopics: string[] }[] | undefined;

export class LeaderboardData {
  private friendships: TtlCache<Friendship[]>;
  private profiles: TtlCache<PublicProfile | null>;
  private medals: TtlCache<Medal | null>;
  private snaps: TtlCache<number | null>;
  private entries: TtlCache<Entry | null>;
  private top: TtlCache<Row[]>;
  private ahead: TtlCache<number>;
  private schools: TtlCache<Map<string, PublicProfile>>;
  private spots: TtlCache<Record<string, string>>;

  constructor(private store: LbStore, private clock: LbClock, private topics: Topics) {
    const n = clock.now;
    this.friendships = new TtlCache(FRIENDS_TTL_MS, 20000, n);
    this.profiles = new TtlCache(SHARED_TTL_MS, 20000, n);
    this.medals = new TtlCache(SHARED_TTL_MS, 20000, n);
    this.snaps = new TtlCache(SHARED_TTL_MS, 20000, n);
    this.entries = new TtlCache(SHARED_TTL_MS, 20000, n);
    this.top = new TtlCache(SHARED_TTL_MS, 4, n);
    this.ahead = new TtlCache(SHARED_TTL_MS, 2000, n);
    this.schools = new TtlCache(SHARED_TTL_MS, 200, n); // LRU-ish: the oldest school goes first
    this.spots = new TtlCache(SPOTS_TTL_MS, 20000, n);
  }

  // ---- friendships (also the daily quests' "friends made today") ----
  async friendList(uid: string): Promise<Friendship[]> {
    const hit = this.friendships.get(uid);
    if (hit) return hit;
    const list = await this.store.friendships(uid);
    this.friendships.set(uid, list);
    return list;
  }
  /** A friendship was created on this instance: the cached lists of both people are stale. */
  invalidateFriends(...uids: (string | null | undefined)[]): void { for (const u of uids) if (u) this.friendships.delete(u); }
  /** Friendships made at/after `sinceMs` (daily quest "make a friend"), from the cached list. */
  async friendsSince(uid: string, sinceMs: number): Promise<number> {
    return (await this.friendList(uid)).filter((f) => f.createdMs >= sinceMs).length;
  }

  /** `uid` earned stars (or their look changed) on this instance: forget their cached monthly entry so the next read is fresh. */
  invalidateUser(uid: string): void {
    const m = this.clock.month(this.clock.now());
    this.entries.delete(`${m}:${uid}`);
    this.top.delete(m);
  }

  // ---- cached many-gets ----
  private async many<V>(cache: TtlCache<V | null>, keyOf: (u: string) => string, uids: string[], load: (miss: string[]) => Promise<Map<string, V>>): Promise<Map<string, V>> {
    const out = new Map<string, V>();
    const miss: string[] = [];
    for (const u of uids) {
      const c = cache.get(keyOf(u));
      if (c === undefined) miss.push(u);
      else if (c !== null) out.set(u, c);
    }
    if (miss.length) {
      const got = await load(miss);
      for (const u of miss) { const v = got.get(u); cache.set(keyOf(u), v ?? null); if (v !== undefined) out.set(u, v); }
    }
    return out;
  }
  private profilesOf(uids: string[]) { return this.many(this.profiles, (u) => u, uids, (m) => this.store.profiles(m)); }
  private medalsOf(uids: string[]) { return this.many(this.medals, (u) => u, uids, (m) => this.store.medals(m)); }
  private snapsOf(date: string, uids: string[]) { return this.many(this.snaps, (u) => `${date}:${u}`, uids, (m) => this.store.snapshot(date, m)); }
  /** Monthly entries of `uids`; `fresh` (the caller) is always read from Firestore and refreshes the cache. */
  private async entriesOf(month: string, uids: string[], fresh?: string): Promise<Map<string, Entry>> {
    const others = uids.filter((u) => u !== fresh);
    const out = await this.many(this.entries, (u) => `${month}:${u}`, others, (m) => this.store.entries(month, m));
    if (fresh && uids.includes(fresh)) {
      const mine = (await this.store.entries(month, [fresh])).get(fresh);
      this.entries.set(`${month}:${fresh}`, mine ?? null);
      if (mine) out.set(fresh, mine);
    }
    return out;
  }
  private async sideData(uids: string[], date: string) {
    const [profiles, medals, snap] = await Promise.all([this.profilesOf(uids), this.medalsOf(uids), this.snapsOf(date, uids)]);
    return { profiles, medals, prevStars: snap.size ? snap : null };
  }
  private async spotsFor(friendUids: string[], gradeOf: (u: string) => Grade): Promise<Record<string, Record<string, string>>> {
    const out: Record<string, Record<string, string>> = {};
    const miss: Record<string, string[]> = {};
    for (const u of friendUids) {
      const g = gradeOf(u), hit = this.spots.get(`${g}:${u}`);
      if (hit === undefined) (miss[g] ??= []).push(u);
      else if (Object.keys(hit).length) out[u] = hit;
    }
    for (const [g, uids] of Object.entries(miss)) {
      const levels = await this.store.progress(g as Grade, uids);
      const topics = this.topics(g);
      for (const u of uids) {
        const s = topics ? computeFriendSpots(topics, levels.get(u)) : {};
        this.spots.set(`${g}:${u}`, s);
        if (Object.keys(s).length) out[u] = s;
      }
    }
    return out;
  }

  /** Live (cached) reads for the daily board's players who joined after it was built (see dailyBoard.ts). */
  liveFallback(): LiveFallback {
    return {
      friendUids: async (uid) => (await this.friendList(uid)).slice(0, MAX_FRIENDS).map((f) => f.uid),
      profiles: (uids) => this.profilesOf(uids),
      spots: (uids, gradeOf) => this.spotsFor(uids, gradeOf),
    };
  }

  // ---- the leaderboard ----
  async leaderboard(uid: string, scope: LeaderboardScope): Promise<GetLeaderboardResponse> {
    const now = this.clock.now();
    const month = this.clock.month(now), date = this.clock.date(now);
    const friendUids = (await this.friendList(uid)).slice(0, MAX_FRIENDS).map((f) => f.uid);
    const respond = async (entries: GetLeaderboardResponse["entries"], profiles: Map<string, PublicProfile>): Promise<GetLeaderboardResponse> => ({
      scope, periodKey: month, selfUid: uid, friendUids,
      friends: friendUids.map((u) => profiles.get(u)).filter((p): p is PublicProfile => !!p),
      entries,
      ...(scope === "friends" ? { friendSpots: await this.spotsFor(friendUids, (u) => profiles.get(u)?.grade ?? profiles.get(uid)?.grade ?? "P6") } : {}),
    });
    const rowsOf = (uids: string[], m: Map<string, Entry>): Row[] => uids.map((u) => ({ uid: u, stars: m.get(u)?.stars ?? 0, questionsDone: m.get(u)?.questionsDone ?? 0 }));

    if (scope === "friends" || scope === "school") {
      let uids = [uid, ...friendUids];
      if (scope === "school") {
        const me = (await this.store.profiles([uid])).get(uid); // own school, fresh
        if (me) this.profiles.set(uid, me);
        const school = me?.school?.trim();
        const mates = school ? await this.schoolMates(school) : null;
        uids = [...new Set([uid, ...(mates ? [...mates.keys()] : [])])];
      }
      const all = [...new Set([...uids, ...friendUids])];
      const [m, side] = await Promise.all([this.entriesOf(month, uids, uid), this.sideData(all, date)]);
      return respond(buildEntries(rowsOf(uids, m), side), side.profiles);
    }

    // global: top 100 shared; the caller's own entry fresh, merged in
    const cachedTop = await this.topRows(month);
    const mine = (await this.entriesOf(month, [uid], uid)).get(uid);
    let rows = cachedTop;
    let outside: Entry | null = null;
    if (mine) {
      const me: Row = { uid, stars: mine.stars, questionsDone: mine.questionsDone };
      const merged = sortRows([...cachedTop.filter((r) => r.uid !== uid), me]);
      if (merged.findIndex((r) => r.uid === uid) < TOP_N) rows = merged.slice(0, TOP_N);
      else { rows = cachedTop.filter((r) => r.uid !== uid); outside = mine; }
    }
    const uids = [...new Set([...rows.map((r) => r.uid), ...(outside ? [uid] : []), ...friendUids])];
    const side = await this.sideData(uids, date);
    const entries = buildEntries(rows, side);
    if (outside) {
      const ahead = await this.aheadOf(month, outside.stars);
      const [me] = buildEntries([{ uid, stars: outside.stars, questionsDone: outside.questionsDone }], { ...side, startRank: ahead + 1 });
      entries.push(me);
    }
    return respond(entries, side.profiles);
  }

  private async topRows(month: string): Promise<Row[]> {
    const hit = this.top.get(month);
    if (hit) return hit;
    const rows = await this.store.topRows(month);
    this.top.set(month, rows);
    return rows;
  }
  private async aheadOf(month: string, stars: number): Promise<number> {
    const key = `${month}:${stars}`, hit = this.ahead.get(key);
    if (hit !== undefined) return hit;
    const n = await this.store.aheadCount(month, stars);
    this.ahead.set(key, n);
    return n;
  }
  private async schoolMates(school: string): Promise<Map<string, PublicProfile>> {
    const hit = this.schools.get(school);
    if (hit) return hit;
    const mates = await this.store.schoolMates(school);
    for (const [u, p] of mates) this.profiles.set(u, p); // the query already read these profiles
    this.schools.set(school, mates);
    return mates;
  }
}
