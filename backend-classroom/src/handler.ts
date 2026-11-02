// HTTP front of the Catapult Classroom backend (Netlify function netlify/functions/api.mjs; local: scripts/dev-server.mjs).
//   POST /api/<name>   Authorization: Bearer <Firebase ID token of the CLASSROOM project>   body {"data": <request>}
//   → 200 {"result": …}  or  4xx/5xx {"error": {"status": "<code>", "message": "…"}}   (same shape as the game's backend)
// Every signed-in call checks that the login wasn't disabled or revoked (a new family code / a disabled teacher stops at once).
import { auth } from "./firebase.js";
import { CALLABLES } from "./index.js";
import { HttpsError } from "./errors.js";
import { RateLimiter } from "./logic/rateLimit.js";

const STATUS: Record<string, number> = {
  "invalid-argument": 400, "failed-precondition": 400, unauthenticated: 401, "permission-denied": 403, "not-found": 404,
  "already-exists": 409, "resource-exhausted": 429, internal: 500,
};
import { originAllowed } from "./logic/origin.js";
const cors = (o: string | null): Record<string, string> => ({
  ...(o && originAllowed(o) ? { "Access-Control-Allow-Origin": o, Vary: "Origin" } : {}),
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "86400",
});
const MAX_BODY = 64 * 1024;
const limiter = new RateLimiter();

export async function handleApi(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  const headers = { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  const fail = (code: string, message: string) => json(STATUS[code] ?? 500, { error: { status: code, message } });
  if (!originAllowed(origin)) return fail("permission-denied", "Not allowed from this site");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (request.method !== "POST") return fail("invalid-argument", "POST only");
  const name = new URL(request.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = (CALLABLES as Record<string, (typeof CALLABLES)[keyof typeof CALLABLES]>)[name];
  if (!fn || !Object.prototype.hasOwnProperty.call(CALLABLES, name)) return fail("not-found", "Unknown function");
  let data: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return fail("invalid-argument", "Request too large");
    data = (JSON.parse(text) as { data?: unknown })?.data ?? {};
  } catch { return fail("invalid-argument", "Body must be JSON {data}"); }
  let who: { uid: string; token: Record<string, unknown> } | undefined;
  const token = (request.headers.get("authorization") ?? "").match(/^Bearer (.+)$/)?.[1];
  if (token) {
    try { const d = await auth.verifyIdToken(token, true); who = { uid: d.uid, token: d as unknown as Record<string, unknown> }; }
    catch { return fail("unauthenticated", "Sign in again."); }
  }
  const key = who ? who.uid : `ip:${request.headers.get("x-nf-client-connection-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown"}`;
  if (!limiter.allow(key, name)) return fail("resource-exhausted", "Too many tries. Wait a minute and try again.");
  try {
    return json(200, { result: (await fn({ data, auth: who })) ?? null });
  } catch (e) {
    if (e instanceof HttpsError) return fail(e.code, e.message);
    console.error(`${name} failed`, e);
    return fail("internal", "Something went wrong.");
  }
}
