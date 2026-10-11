import { handleApi } from "../handler.mjs";

export default (request) => handleApi(request);
// Edge rate limit per client IP (all server instances together): a script hammering the API is stopped at Netlify's
// edge before it costs function time or database reads. A class of students behind one school IP stays well under.
export const config = { path: "/api/*", rateLimit: { windowLimit: 300, windowSize: 60, aggregateBy: ["ip", "domain"] } };
