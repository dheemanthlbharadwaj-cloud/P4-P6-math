import { boardBuild } from "../handler.mjs";

// 15:55 UTC = 23:55 Singapore time: the leaderboard is rebuilt once a day, just before midnight.
export default async () => { await boardBuild(); };
export const config = { schedule: "55 15 * * *" };
