// RevenueCat webhook event → entitlements/{uid} patch. Pure.
import { SUBSCRIPTION_ENTITLEMENT } from "../shared/index.js";

export interface RcEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  entitlement_ids?: string[] | null;
  product_id?: string;
  store?: string;
  environment?: string;
  event_timestamp_ms?: number;
  expiration_at_ms?: number | null;
}
export interface EntitlementPatch {
  unlimited: boolean; // has the "unlimited" entitlement right now
  willRenew: boolean;
  expiresAt: number | null;
  productId: string | null;
  store: string | null;
  environment: string | null;
  lastEventId: string | null;
  lastEventType: string;
  lastEventAt: number;
}

const ACTIVATING = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "NON_RENEWING_PURCHASE"]);

/** Server-side "is the entitlement active": for expiry-bearing events, trust the expiration time too. */
export function isActiveAt(expiresAt: number | null, now: number): boolean {
  return expiresAt == null || expiresAt > now;
}

/** entitlements/{uid} doc → is the "unlimited" entitlement active at `now` (expired subscriptions never count). */
export function isSubscribed(ent: { unlimited?: unknown; expiresAt?: unknown } | undefined, now: number): boolean {
  if (!ent || ent.unlimited !== true) return false;
  return isActiveAt(typeof ent.expiresAt === "number" ? ent.expiresAt : null, now);
}

export function pickUid(e: RcEvent): string | null {
  const candidates = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])].filter((x): x is string => !!x);
  return candidates.find((c) => !c.startsWith("$RCAnonymousID")) ?? null;
}

export function mapRevenueCatEvent(e: RcEvent, now: number): { uid: string; patch: EntitlementPatch } | null {
  const type = e.type ?? "";
  if (!ACTIVATING.has(type) && type !== "CANCELLATION" && type !== "EXPIRATION") return null;
  if (e.entitlement_ids && e.entitlement_ids.length && !e.entitlement_ids.includes(SUBSCRIPTION_ENTITLEMENT)) return null;
  const uid = pickUid(e);
  if (!uid) return null;
  const expiresAt = typeof e.expiration_at_ms === "number" ? e.expiration_at_ms : null;
  let unlimited: boolean;
  let willRenew: boolean;
  if (type === "EXPIRATION") { unlimited = false; willRenew = false; }
  else if (type === "CANCELLATION") { unlimited = isActiveAt(expiresAt, now); willRenew = false; } // access continues until expiry
  else { unlimited = isActiveAt(expiresAt, now); willRenew = true; }
  return {
    uid,
    patch: {
      unlimited, willRenew, expiresAt,
      productId: e.product_id ?? null, store: e.store ?? null, environment: e.environment ?? null,
      lastEventId: e.id ?? null, lastEventType: type, lastEventAt: e.event_timestamp_ms ?? now,
    },
  };
}

/** Constant-time-ish comparison of the Authorization header with the configured secret ("Bearer x" or "x"). */
export function authHeaderMatches(header: string | undefined, secret: string, timingSafeEqual: (a: Buffer, b: Buffer) => boolean): boolean {
  if (!header || !secret) return false;
  const given = header.replace(/^Bearer\s+/i, "");
  const want = secret.replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
