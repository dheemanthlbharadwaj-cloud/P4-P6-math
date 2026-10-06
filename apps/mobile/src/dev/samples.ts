// SAMPLE DATA so the app can be tried before the backend is live: sample friends (map cats + race track), sample
// school mates and global players for the leaderboard, and a sample friend request. They appear only when the real
// backend is unavailable. To remove them: set SHOW_SAMPLES = false (or delete this file and the few places that
// import it).
//
// What the samples show on the leaderboard (stars = this month's stars):
// - Friends: 7 friends, more than the 5 cats the race track shows at once (so it scrolls), with a tie (Ethan and
//   Hana, 21) and someone on 0 (Ravi) so the track's left end is used.
// - School: classmates at the student's own school (whatever school is in their profile) + friends at that school.
// - Global: 25 players across schools, top 3 with last month's medals.
import type { CatLook, GetLeaderboardResponse, LeaderboardEntry, LeaderboardScope, PublicProfile } from "@p6/shared";

export const SHOW_SAMPLES = true;

type Sample = PublicProfile & { stars: number; questionsDone: number };
const p = (uid: string, name: string, school: string, colorId: string, hatId: string | null, catName: string, stars: number, questionsDone: number): Sample => ({
  uid: `sample-${uid}`, displayName: `${name} (sample)`, school, grade: "P6", cat: { name: catName, colorId, hatId }, stars, questionsDone,
});

const FRIENDS: Sample[] = [
  p("aisyah", "Aisyah", "Nanyang Primary School", "color-calico", "hat-crown", "Biscuit", 48, 120),
  p("ethan", "Ethan", "Rosyth School", "color-grey", null, "Pepper", 21, 64),
  p("zoe", "Zoe", "Raffles Girls' Primary School", "color-white", "hat-wizard", "Snowy", 80, 190),
  p("marcus", "Marcus", "Tao Nan School", "color-ginger", "hat-cap", "Tiger", 63, 150),
  p("priya", "Priya", "Nanyang Primary School", "color-rose", "hat-grad", "Rosie", 35, 88),
  p("hana", "Hana", "Henry Park Primary School", "color-black", "hat-cap", "Luna", 21, 52),
  p("ravi", "Ravi", "Ai Tong School", "color-ocean", null, "Bubbles", 0, 4),
];
export const SAMPLE_FRIENDS: PublicProfile[] = FRIENDS.map(({ stars: _s, questionsDone: _q, ...f }) => f);

/** A friend request the student can accept or decline in Profile. */
export const SAMPLE_FRIEND_REQUEST = { id: "sample-request", name: "Wei Jie (sample)" };
const WEIJIE = p("weijie", "Wei Jie", "Tao Nan School", "color-ginger", "hat-wizard", "Mochi", 12, 30);
export const SAMPLE_REQUEST_PROFILE: PublicProfile = (({ stars: _s, questionsDone: _q, ...f }) => f)(WEIJIE);

/** Classmates: their school is set to the student's own school when the leaderboard is built. */
const SCHOOL_MATES: Omit<Sample, "school">[] = [
  p("kai", "Kai", "", "color-grey", "hat-grad", "Smokey", 72, 170),
  p("mei", "Mei Ling", "", "color-white", "hat-crown", "Pearl", 55, 140),
  p("dylan", "Dylan", "", "color-black", null, "Shadow", 33, 80),
  p("sofia", "Sofia", "", "color-calico", "hat-cap", "Patches", 27, 70),
  p("arjun", "Arjun", "", "color-ginger", null, "Mango", 14, 40),
  p("nur", "Nur", "", "color-rose", "hat-wizard", "Blossom", 6, 15),
];

const OTHERS: Sample[] = [
  p("jia-hui", "Jia Hui", "Catholic High School (Primary)", "color-galaxy", "hat-wizard-star", "Nova", 196, 400),
  p("aaron", "Aaron", "ACS (Junior)", "color-ocean", "hat-crown-royal", "Wave", 171, 360),
  p("chloe", "Chloe", "Methodist Girls' School", "color-rose", "hat-cap-gold", "Petal", 150, 330),
  p("ben", "Ben", "Nan Hua Primary School", "color-ginger", "hat-crown", "Sunny", 122, 280),
  p("isabel", "Isabel", "St. Nicholas Girls' School", "color-white", "hat-grad", "Cloud", 117, 270),
  p("farhan", "Farhan", "Red Swastika School", "color-black", "hat-wizard", "Ninja", 101, 240),
  p("lucas", "Lucas", "Pei Hwa Presbyterian Primary", "color-grey", null, "Ash", 95, 220),
  p("amelia", "Amelia", "Ai Tong School", "color-calico", "hat-cap", "Cookie", 88, 210),
  p("yusuf", "Yusuf", "Rosyth School", "color-ocean", null, "Splash", 76, 180),
  p("grace", "Grace", "Henry Park Primary School", "color-white", "hat-crown", "Angel", 58, 130),
  p("noah", "Noah", "Tao Nan School", "color-ginger", "hat-grad", "Ginger", 40, 100),
];
const MEDALS: Record<string, LeaderboardEntry["medal"]> = { "sample-jia-hui": "gold", "sample-aaron": "silver", "sample-chloe": "bronze" };

/** This month's stars for a sample player (friends on the map / race track). */
export const sampleStars = (uid: string) => [...FRIENDS, WEIJIE].find((f) => f.uid === uid)?.stars ?? 0;

/**
 * Leaderboard from the samples. friends: the student + their friends (whoever is in the friends list);
 * school: the student's school; global: everyone. Ranked by this month's stars, then questions done.
 */
export function sampleLeaderboard(
  scope: LeaderboardScope,
  self: { uid: string; displayName: string; school: string; cat: CatLook; stars: number; questionsDone: number },
  friends: PublicProfile[],
): GetLeaderboardResponse {
  const friendRows = [...FRIENDS, WEIJIE].filter((f) => friends.some((x) => x.uid === f.uid));
  const school = self.school.trim();
  const mates: Sample[] = school ? SCHOOL_MATES.map((m) => ({ ...m, school })) : [];
  const me = { uid: self.uid, displayName: self.displayName, school: self.school, cat: self.cat, stars: self.stars, questionsDone: self.questionsDone };
  const pool: { uid: string; displayName: string; school?: string; cat: CatLook; stars: number; questionsDone: number }[] =
    scope === "friends" ? friendRows
      : scope === "school" ? (school ? [...mates, ...friendRows.filter((f) => f.school === school)] : [])
        : [...OTHERS, ...mates, ...FRIENDS, WEIJIE];
  const rows = [me, ...pool.filter((r, i, a) => a.findIndex((x) => x.uid === r.uid) === i)]
    .sort((a, b) => b.stars - a.stars || b.questionsDone - a.questionsDone);
  const entries: LeaderboardEntry[] = rows.map((r, i) => ({
    uid: r.uid, displayName: r.displayName, ...(r.school ? { school: r.school } : {}),
    cat: { colorId: r.cat.colorId, hatId: r.cat.hatId }, stars: r.stars, questionsDone: r.questionsDone,
    rank: i + 1, rankDelta: 0, ...(MEDALS[r.uid] ? { medal: MEDALS[r.uid] } : {}),
  }));
  return {
    scope,
    periodKey: new Date().toISOString().slice(0, 7),
    selfUid: self.uid,
    friendUids: friendRows.map((f) => f.uid),
    friends: friendRows.map(({ stars: _s, questionsDone: _q, ...f }) => f),
    entries,
  };
}
