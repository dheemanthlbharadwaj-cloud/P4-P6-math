import { nightly } from "../handler.mjs";

// 16:00 UTC = 00:00 Singapore time.
export default async () => { await nightly(); };
export const config = { schedule: "0 16 * * *" };
