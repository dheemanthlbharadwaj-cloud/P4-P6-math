// The backend on Netlify (free plan, no billing): the same handlers as the Cloud Functions in ../functions (compiled,
// copied to lib/ by scripts/copy-lib.mjs), called through one HTTP endpoint instead of Firebase callables.
//
//   POST /api/<name>   Authorization: Bearer <Firebase ID token>   body {"data": <request>}
//   → 200 {"result": <response>}   or   4xx/5xx {"error": {"status": "<callable error code>", "message": "..."}}
//
// Firebase Auth + Firestore stay in the (Spark plan) Firebase project; the service account comes from
// BACKEND_SERVICE_ACCOUNT_B64, or the STUDENT_* / EDITOR_* / LEGACY_AUTH_PROJECT_ID variables (see ../functions/src/admin.ts
// and logic/projects.ts). Tokens are verified against the student project, then LEGACY_AUTH_PROJECT_ID if set.
import { timingSafeEqual } from "node:crypto";
import fns from "./lib/index.js";
import admin from "./lib/admin.js";
import rc from "./lib/logic/revenuecat.js";
import dates from "./lib/logic/dates.js";
import rateLimit from "./lib/logic/rateLimit.js";
import classroom from "./lib/classroom.js";

const CALLABLES = new Set([
  "bootstrapProfile", "submitLevelResult", "submitMinigameResult", "claimQuest", "purchaseItem", "redeemReferral",
  "sendFriendRequest", "respondFriendRequest", "getLeaderboard", "refreshPublicProfile", "reportQuestion", "updateProfile", "syncProgress", "listFriendRequests", "deleteAccount", "getDailyQuests", "claimDailyQuest", "getQuestionPatches",
  // classroom (packages/shared/src/classroom.ts)
  "teacherGetDashboard", "teacherSaveClass", "teacherDeleteClass", "teacherAddStudent", "teacherRemoveStudent", "teacherSetBirthday", "teacherPost",
  "teacherDeletePost", "teacherUploadSignature", "teacherCreateTask", "teacherListTasks", "teacherGetTaskMarks", "teacherMarkTask", "teacherGetAnalytics",
  "getMyClassroom", "submitTaskAnswers",
]);
// Callable error code → HTTP status (same table as Firebase callables).
const STATUS = {
  "invalid-argument": 400, "failed-precondition": 400, "out-of-range": 400, unauthenticated: 401, "permission-denied": 403,
  "not-found": 404, "already-exists": 409, aborted: 409, "resource-exhausted": 429, cancelled: 499, unimplemented: 501,
  unavailable: 503, "deadline-exceeded": 504, internal: 500, unknown: 500,
};
// Browsers may call the API only from the app's own pages (the native apps send no Origin). Extra origins:
// ALLOWED_ORIGINS (comma-separated) in the site's environment variables.
const ALLOWED_ORIGINS = new Set([
  "https://catapult-math-athletes.web.app", "https://catapult-math-athletes.firebaseapp.com",
  ...(process.env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
]);
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/; // local test builds
const originAllowed = (origin) => !origin || ALLOWED_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin);
const corsFor = (origin) => ({
  ...(origin && originAllowed(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}), // auth is the bearer token, never cookies
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
});
const MAX_BODY_BYTES = 64 * 1024; // the largest real request (a sync with 200 bookmarks) is a few KB
const limiter = new rateLimit.RateLimiter();

export async function handleApi(request) {
  const origin = request.headers.get("origin");
  const headers = { ...corsFor(origin), "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers });
  const fail = (code, message) => json(STATUS[code] ?? 500, { error: { status: code, message } });

  if (!originAllowed(origin)) return fail("permission-denied", "Not allowed from this site");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsFor(origin) });
  if (request.method !== "POST") return fail("invalid-argument", "POST only");
  const name = new URL(request.url).pathname.split("/").filter(Boolean).pop();
  if (!CALLABLES.has(name)) return fail("not-found", "Unknown function");

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return fail("invalid-argument", "Request too large");
  let data;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return fail("invalid-argument", "Request too large");
    data = JSON.parse(text)?.data ?? {};
  } catch { return fail("invalid-argument", "Body must be JSON {data}"); }
  let auth;
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer (.+)$/)?.[1];
  if (token) {
    try {
      const decoded = await admin.verifyIdToken(token);
      auth = { uid: decoded.uid, token: decoded, rawToken: token };
    } catch { return fail("unauthenticated", "Sign in again."); }
  }
  // Per-account limits (per IP for calls without an account; the edge also limits per IP, see functions/api.mjs).
  const who = auth ? auth.uid : `ip:${request.headers.get("x-nf-client-connection-ip") ?? "unknown"}`;
  if (!limiter.allow(who, name)) return fail("resource-exhausted", "Too many requests. Wait a minute and try again.");
  try {
    const result = await fns[name].run({ data, auth, rawRequest: request, acceptsStreaming: false });
    return json(200, { result: result ?? null });
  } catch (e) {
    if (e && typeof e.code === "string" && STATUS[e.code] && e.httpErrorCode) return fail(e.code, e.message);
    console.error(`${name} failed`, e);
    return fail("internal", "Something went wrong.");
  }
}

/** 00:00 Singapore time every day: on the 1st, close last month (medals); every day, the classes' birthday posts (one read per class). */
export async function nightly(now = Date.now()) {
  if (dates.sgtDate(now).endsWith("-01")) await fns.monthlyClose.run({});
  try { await classroom.postBirthdays(now); } catch (e) { console.error("birthday posts failed", e); } // never blocks the month close above
}

/** 23:55 Singapore time every day: build the day's leaderboard, the only time it changes (lib/logic/dailyBoard.js). */
export async function boardBuild() {
  await fns.dailyBoardBuild.run({});
}

/** RevenueCat → entitlements/{uid} (same as revenuecatWebhook in ../functions/src/revenuecat.ts). */
export async function handleRevenueCat(request) {
  if (request.method !== "POST") return new Response("POST only", { status: 405 });
  if (!rc.authHeaderMatches(request.headers.get("authorization") ?? undefined, process.env.REVENUECAT_WEBHOOK_AUTH ?? "", timingSafeEqual)) {
    return new Response("unauthorized", { status: 401 });
  }
  let event = null;
  try { event = (await request.json())?.event ?? null; } catch { /* handled below */ }
  if (!event) return new Response("no event", { status: 400 });
  const mapped = rc.mapRevenueCatEvent(event, Date.now());
  if (!mapped) return new Response("ignored", { status: 200 });
  const ref = admin.db.collection(admin.col.entitlements).doc(mapped.uid);
  const applied = await admin.db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (cur.exists && (cur.data().lastEventAt ?? 0) > mapped.patch.lastEventAt) return false; // out-of-order delivery
    tx.set(ref, { ...mapped.patch, updatedAt: admin.FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  return new Response(applied ? "ok" : "stale", { status: 200 });
}
