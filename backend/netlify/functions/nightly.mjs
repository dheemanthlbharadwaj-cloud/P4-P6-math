import { nightly } from "../handler.mjs";

// 16:00 UTC = 00:00 Singapore time: closes the month (medals) on the 1st; posts the classes' birthdays every day.
export default async () => { await nightly(); };
export const config = { schedule: "0 16 * * *" };
