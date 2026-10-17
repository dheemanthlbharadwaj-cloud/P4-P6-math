import assert from "node:assert/strict";
import * as S from "./syncdelta.v1.js";
const T = ms => ({ toMillis: () => ms });
const now = Date.UTC(2026, 9, 17);
// kinds
assert.equal(S.kindOf(T(1)), "ts"); assert.equal(S.kindOf({ seconds: 5, nanoseconds: 0 }), "ts");
assert.equal(S.kindOf("2026-01-01T00:00:00.000Z"), "str"); assert.equal(S.kindOf(undefined), null); assert.equal(S.kindOf(5), null);
// markerFromDocs: mixed types, missing field
const docs = [{ last_edited_at: T(1000) }, { last_edited_at: T(5000) }, { last_edited_at: "2026-03-01T00:00:00.000Z" },
  { last_edited_at: "2026-02-01T00:00:00.000Z" }, {}];
const m = S.markerFromDocs(docs, now);
assert.equal(m.ts, 5000); assert.equal(m.str, "2026-03-01T00:00:00.000Z"); assert.equal(m.full, now);
// only strings seen -> ts falls back to full time
const m2 = S.markerFromDocs([{ last_edited_at: "2026-03-01T00:00:00.000Z" }], now);
assert.equal(m2.ts, null); assert.equal(S.floors(m2).tsMs, now - S.SKEW_MS);
const f = S.floors(m); assert.equal(f.tsMs, 5000 - S.SKEW_MS);
assert.equal(f.strIso, new Date(Date.parse("2026-03-01T00:00:00.000Z") - S.SKEW_MS).toISOString());
// serialize / parse / stale
assert.deepEqual(S.parseMarker(S.serializeMarker(m)), m);
assert.equal(S.parseMarker("garbage"), null); assert.equal(S.parseMarker(null), null); assert.equal(S.parseMarker('{"x":1}'), null);
assert.equal(S.isStale(m, now + 6 * 864e5), false); assert.equal(S.isStale(m, now + 8 * 864e5), true);
assert.equal(S.isStale(null, now), true); assert.equal(S.isStale({ ...m, full: now + 1e9 }, now), true);
// skipChange
assert.equal(S.skipChange("removed", true), true); assert.equal(S.skipChange("removed", false), false);
assert.equal(S.skipChange("modified", true), false);
// advance never goes backwards
const mk = { ...m }; assert.equal(S.advance(mk, T(1)), false); assert.equal(mk.ts, 5000);
assert.equal(S.advance(mk, T(7000)), true); assert.equal(mk.ts, 7000);
assert.equal(S.advance(mk, "2026-01-01T00:00:00.000Z"), false);
console.log("syncdelta tests OK");
