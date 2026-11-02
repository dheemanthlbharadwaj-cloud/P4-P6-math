// Callable plumbing without firebase-functions: a request carries { data, auth }; errors carry a callable code that the
// HTTP handler turns into a status (same codes and JSON shape as the game's backend, so the web app's client is the same).
export type ErrorCode = "invalid-argument" | "failed-precondition" | "already-exists" | "not-found" | "permission-denied" | "unauthenticated" | "resource-exhausted" | "internal";
export class HttpsError extends Error {
  readonly httpErrorCode = true;
  constructor(public code: ErrorCode, message: string) { super(message); }
}
export interface CallableRequest { data: unknown; auth?: { uid: string; token: Record<string, unknown> } }
export type Callable<T = unknown> = (req: CallableRequest) => Promise<T>;
/** Same name as firebase-functions' so the callables read the same; here it just types the function. */
export const onCall = <T>(fn: (req: CallableRequest) => Promise<T>): Callable<T> => fn;

export type Fail = { ok: false; code: Exclude<ErrorCode, "unauthenticated" | "resource-exhausted" | "internal">; message: string };
export type Ok<T = object> = { ok: true } & T;
export function throwFail(f: Fail): never { throw new HttpsError(f.code, f.message); }
export function requireUid(req: CallableRequest): string {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  return req.auth.uid;
}
