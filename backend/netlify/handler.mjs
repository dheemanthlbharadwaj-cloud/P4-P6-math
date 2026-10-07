// The backend on Netlify (free plan, no billing): the same handlers as the Cloud Functions in ../functions (compiled,
// copied to lib/ by scripts/copy-lib.mjs), called through one HTTP endpoint instead of Firebase callables.
//
//   POST /api/<name>   Authorization: Bearer <Firebase ID token>   body {"data": <request>}
//   → 200 {"result": <response>}   or   4xx/5xx {"error": {"status": "<callable error code>", "message": "..."}}
//
// Firebase Auth + Firestore stay in the (Spark plan) Firebase project; the service account comes from
// BACKEND_SERVICE_ACCOUNT_B64 (see ../functions/src/admin.ts).
import { timingSafeEqual } from "node:crypto";
import fns from "./lib/index.js";
import admin from "./lib/admin.js";
import rc from "./lib/logic/revenuecat.js";
import dates from "./lib/logic/dates.js";

const CALLABLES = new Set([
  "bootstrapProfile", "submitLevelResult", "submitMinigameResult", "claimQuest", "purchaseItem", "redeemReferral",
  "sendFriendRequest", "respondFriendRequest", "getLeaderboard", "refreshPublicProfile", "deleteAccount",
]);
// Callable error code → HTTP status (same table as Firebase callables).
const STATUS = {
  "invalid-argument": 400, "failed-precondition": 400, "out-of-range": 400, unauthenticated: 401, "permission-denied": 403,
  "not-found": 404, "already-exists": 409, aborted: 409, "resource-exhausted": 429, cancelled: 499, unimplemented: 501,
  unavailable: 503, "deadline-exceeded": 504, internal: 500, unknown: 500,
};
const CORS = {
  "Access-Control-Allow-Origin": "*", // auth is the bearer token, never cookies
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (code, message) => json(STATUS[code] ?? 500, { error: { status: code, message } });

export async function handleApi(request) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return fail("invalid-argument", "POST only");
  const name = new URL(request.url).pathname.split("/").filter(Boolean).pop();
  if (!CALLABLES.has(name)) return fail("not-found", "Unknown function");

  let data;
  try { data = (await request.json())?.data ?? {}; } catch { return fail("invalid-argument", "Body must be JSON {data}"); }
  let auth;
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer (.+)$/)?.[1];
  if (token) {
    try {
      const decoded = await admin.auth.verifyIdToken(token);
      auth = { uid: decoded.uid, token: decoded, rawToken: token };
    } catch { return fail("unauthenticated", "Sign in again."); }
  }
  try {
    const result = await fns[name].run({ data, auth, rawRequest: request, acceptsStreaming: false });
    return json(200, { result: result ?? null });
  } catch (e) {
    if (e && typeof e.code === "string" && STATUS[e.code] && e.httpErrorCode) return fail(e.code, e.message);
    console.error(`${name} failed`, e);
    return fail("internal", "Something went wrong.");
  }
}

/** 00:00 Singapore time every day: close last month on the 1st, then snapshot the monthly board. */
export async function nightly(now = Date.now()) {
  if (dates.sgtDate(now).endsWith("-01")) await fns.monthlyClose.run({});
  await fns.dailySnapshot.run({});
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
