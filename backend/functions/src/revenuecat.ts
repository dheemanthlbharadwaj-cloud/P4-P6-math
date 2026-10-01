import { timingSafeEqual } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { col, db, FieldValue, REGION } from "./admin.js";
import { authHeaderMatches, mapRevenueCatEvent, type RcEvent } from "./logic/revenuecat.js";

/** Set with: firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH  (same value as the Authorization header in the RevenueCat dashboard) */
export const REVENUECAT_WEBHOOK_AUTH = defineSecret("REVENUECAT_WEBHOOK_AUTH");

export const revenuecatWebhook = onRequest({ region: REGION, secrets: [REVENUECAT_WEBHOOK_AUTH], cors: false }, async (req, res) => {
  if (req.method !== "POST") { res.status(405).send("POST only"); return; }
  if (!authHeaderMatches(req.get("authorization"), REVENUECAT_WEBHOOK_AUTH.value(), timingSafeEqual)) { res.status(401).send("unauthorized"); return; }
  const event = (req.body?.event ?? null) as RcEvent | null;
  if (!event) { res.status(400).send("no event"); return; }
  const mapped = mapRevenueCatEvent(event, Date.now());
  if (!mapped) { res.status(200).send("ignored"); return; }
  const ref = db.collection(col.entitlements).doc(mapped.uid);
  const applied = await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    // ignore out-of-order deliveries
    if (cur.exists && (cur.data()!.lastEventAt ?? 0) > mapped.patch.lastEventAt) return false;
    tx.set(ref, { ...mapped.patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  res.status(200).send(applied ? "ok" : "stale");
});
