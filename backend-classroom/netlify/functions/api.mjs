import lib from "../lib/handler.js";

export default (request) => lib.handleApi(request);
// Edge limit per client IP across all instances (a class behind one school IP stays well under).
export const config = { path: "/api/*", rateLimit: { windowLimit: 300, windowSize: 60, aggregateBy: ["ip", "domain"] } };
