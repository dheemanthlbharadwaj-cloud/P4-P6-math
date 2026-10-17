/* Pure helpers for delta loading of the questions collection (no Firebase imports, unit-testable in plain node).
   last_edited_at is stored in two types: Firestore Timestamp (editor saves, serverTimestamp()) and ISO string
   (scripts). A Firestore range query only matches values of the SAME type, so each scope keeps one marker per type. */
export const STALE_MS = 7 * 24 * 3600 * 1000;   // cached copy older than this => full reload
export const SKEW_MS = 60 * 1000;               // re-read this much before the marker (clock/commit-order safety)

export const markerKey = (uid, scope) => `qsync:${uid}:${scope}`;

/** "ts" for a Firestore Timestamp (or {seconds,nanoseconds}), "str" for an ISO-like string, else null. */
export function kindOf(v) {
  if (v == null) return null;
  if (typeof v === "string") return v ? "str" : null;
  if (typeof v.toMillis === "function") return "ts";
  if (typeof v.seconds === "number" && typeof v.nanoseconds === "number") return "ts";
  return null;
}
export function tsMillis(v) {
  if (typeof v.toMillis === "function") return v.toMillis();
  return v.seconds * 1000 + Math.floor(v.nanoseconds / 1e6);
}

/** marker = { ts: ms|null, str: isoString|null, full: ms (time of last full load) } */
export function emptyMarker(now) { return { ts: null, str: null, full: now }; }

/** Raise the marker with one doc's last_edited_at. Returns true if it moved. */
export function advance(marker, v) {
  const k = kindOf(v);
  if (k === "ts") { const m = tsMillis(v); if (marker.ts == null || m > marker.ts) { marker.ts = m; return true; } }
  if (k === "str") { if (marker.str == null || v > marker.str) { marker.str = v; return true; } }
  return false;
}

/** Marker after a full load: highest value seen per type. A type never seen starts at loadStart (minus skew), so
 *  the first later write of that type is still caught. */
export function markerFromDocs(docs, loadStart) {
  const m = emptyMarker(loadStart);
  for (const d of docs) advance(m, d.last_edited_at);
  return m;
}

export function parseMarker(raw) {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw);
    if (!m || typeof m.full !== "number") return null;
    return { ts: typeof m.ts === "number" ? m.ts : null, str: typeof m.str === "string" ? m.str : null, full: m.full };
  } catch (_) { return null; }
}
export const serializeMarker = m => JSON.stringify({ ts: m.ts, str: m.str, full: m.full });

export const isStale = (m, now) => !m || now - m.full > STALE_MS || m.full > now + SKEW_MS;

/** Lower bounds for the two delta queries: { tsMs, strIso }. A missing type falls back to the last full load time. */
export function floors(m) {
  const tsMs = (m.ts != null ? m.ts : m.full) - SKEW_MS;
  const strBase = m.str != null && !Number.isNaN(Date.parse(m.str)) ? Date.parse(m.str) : m.full;
  return { tsMs, strIso: new Date(strBase - SKEW_MS).toISOString() };
}

/** In delta mode a "removed" change only means the doc left the delta query (type or scope changed), never a deletion
 *  (the editor never deletes questions; the Full refresh button covers anything else), so it must not drop the doc. */
export const skipChange = (type, delta) => delta && type === "removed";
