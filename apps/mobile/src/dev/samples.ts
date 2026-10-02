// SAMPLE DATA so the app can be tried before the backend is live: two sample friends, a sample leaderboard and a
// sample friend request. They appear only when the real backend is unavailable.
// To remove them: set SHOW_SAMPLES = false (or delete this file and the few places that import it).
import type { CatLook, GetLeaderboardResponse, LeaderboardEntry, LeaderboardScope, PublicProfile } from "@p6/shared";

export const SHOW_SAMPLES = true;

export const SAMPLE_FRIENDS: PublicProfile[] = [
  { uid: "sample-aisyah", displayName: "Aisyah (sample)", school: "Nanyang Primary School", grade: "P6", cat: { name: "Biscuit", colorId: "color-calico", hatId: "hat-crown" } },
  { uid: "sample-ethan", displayName: "Ethan (sample)", school: "Rosyth School", grade: "P6", cat: { name: "Pepper", colorId: "color-grey", hatId: null } },
];

/** A friend request the student can accept or decline in Profile. */
export const SAMPLE_FRIEND_REQUEST = { id: "sample-request", name: "Wei Jie (sample)" };
export const SAMPLE_REQUEST_PROFILE: PublicProfile = {
  uid: "sample-weijie", displayName: "Wei Jie (sample)", school: "Tao Nan School", grade: "P6", cat: { name: "Mochi", colorId: "color-ginger", hatId: "hat-wizard" },
};

const SAMPLE_SCORES: Record<string, { daily: [number, number]; monthly: [number, number] }> = {
  // [stars, questions done]
  "sample-aisyah": { daily: [6, 15], monthly: [48, 120] },
  "sample-ethan": { daily: [3, 10], monthly: [21, 64] },
  "sample-weijie": { daily: [2, 5], monthly: [12, 30] },
};

/** Leaderboard with the student plus the sample friends (daily) or sample players (monthly). */
export function sampleLeaderboard(
  scope: LeaderboardScope,
  self: { uid: string; displayName: string; cat: CatLook; stars: number; questionsDone: number },
  friends: PublicProfile[],
): GetLeaderboardResponse {
  const others = friends.filter((f) => SAMPLE_SCORES[f.uid]);
  const rows = [
    { uid: self.uid, displayName: self.displayName, cat: self.cat, stars: self.stars, questionsDone: self.questionsDone },
    ...others.map((f) => ({ uid: f.uid, displayName: f.displayName, cat: { colorId: f.cat.colorId, hatId: f.cat.hatId }, stars: SAMPLE_SCORES[f.uid][scope][0], questionsDone: SAMPLE_SCORES[f.uid][scope][1] })),
  ].sort((a, b) => b.stars - a.stars || b.questionsDone - a.questionsDone);
  const entries: LeaderboardEntry[] = rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    rankDelta: r.uid === "sample-aisyah" ? 1 : r.uid === "sample-ethan" ? -1 : 0,
    ...(r.uid === "sample-aisyah" ? { medal: "gold" as const } : {}),
  }));
  const now = new Date();
  return {
    scope,
    periodKey: scope === "daily" ? now.toISOString().slice(0, 10) : now.toISOString().slice(0, 7),
    selfUid: self.uid,
    friendUids: others.map((f) => f.uid),
    friends: others,
    entries,
  };
}
