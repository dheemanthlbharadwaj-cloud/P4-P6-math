import { describe, expect, it } from "vitest";
import { STORE_ITEMS } from "../src/shared";
import {
  daysInMonth, effectiveResultTime, isLastDayOfMonthSGT, monthEndInstantSGT, nextMonthKey, previousDate, previousMonthKey, sgtDate, sgtMonth, shiftDate,
} from "../src/logic/dates";
import { buildEntries, pickMedalWinners, rankDeltas, rankMap, sortRows } from "../src/logic/ranking";
import {
  isContentVersionAccepted, isFriendCode, makeFriendCode, minigameStars, normalizeFriendCode, pairId, validateClaimQuest,
  validateFriendRequest, validateLevelResult, validateMinigameResult, validatePurchase, validateReferral,
} from "../src/logic/rules";
import { authHeaderMatches, isActiveAt, isSubscribed, mapRevenueCatEvent, pickUid } from "../src/logic/revenuecat";
import { timingSafeEqual } from "node:crypto";

const utc = (s: string) => Date.parse(s);

describe("SGT date math", () => {
  it("rolls over at 16:00 UTC", () => {
    expect(sgtDate(utc("2026-10-01T15:59:59Z"))).toBe("2026-10-01");
    expect(sgtDate(utc("2026-10-01T16:00:00Z"))).toBe("2026-10-02");
  });
  it("month boundary in SGT", () => {
    expect(sgtMonth(utc("2026-09-30T15:59:59Z"))).toBe("2026-09");
    expect(sgtMonth(utc("2026-09-30T16:00:00Z"))).toBe("2026-10");
  });
  it("year boundary", () => {
    expect(sgtDate(utc("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
    expect(previousMonthKey("2027-01")).toBe("2026-12");
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });
  it("days in month incl. leap years", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
  it("last day of month in SGT", () => {
    expect(isLastDayOfMonthSGT(utc("2028-02-29T00:00:00Z"))).toBe(true);
    expect(isLastDayOfMonthSGT(utc("2028-02-28T00:00:00Z"))).toBe(false);
    expect(isLastDayOfMonthSGT(utc("2026-04-30T16:00:00Z"))).toBe(false); // already May 1 in SGT
  });
  it("month end instant is 00:00 SGT on the 1st", () => {
    expect(monthEndInstantSGT("2026-09")).toBe(utc("2026-09-30T16:00:00Z"));
    expect(sgtDate(monthEndInstantSGT("2026-09"))).toBe("2026-10-01");
  });
  it("shiftDate", () => {
    expect(previousDate("2026-03-01")).toBe("2026-02-28");
    expect(previousDate("2028-03-01")).toBe("2028-02-29");
    expect(shiftDate("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("effectiveResultTime: plausible offline result keeps its time", () => {
    const now = utc("2026-10-10T04:00:00Z");
    expect(effectiveResultTime(now - 3600_000, now)).toBe(now - 3600_000);
  });
  it("effectiveResultTime: future / stale / closed month → server time", () => {
    const now = utc("2026-10-10T04:00:00Z");
    expect(effectiveResultTime(now + 3600_000, now)).toBe(now);
    expect(effectiveResultTime(now - 8 * 86400_000, now)).toBe(now);
    const early = utc("2026-10-02T04:00:00Z");
    expect(effectiveResultTime(utc("2026-09-30T10:00:00Z"), early)).toBe(early);
    expect(effectiveResultTime(NaN, now)).toBe(now);
  });
});

describe("ranking", () => {
  const rows = [
    { uid: "c", stars: 10, questionsDone: 5 },
    { uid: "a", stars: 10, questionsDone: 9 },
    { uid: "b", stars: 30, questionsDone: 1 },
    { uid: "d", stars: 10, questionsDone: 5 },
  ];
  it("sorts by stars, then questionsDone, then uid", () => expect(sortRows(rows).map((r) => r.uid)).toEqual(["b", "a", "c", "d"]));
  it("rankMap", () => expect(rankMap(rows).get("c")).toBe(3));
  it("deltas: rose / fell / same", () => {
    const prev = new Map([["a", 40], ["b", 30], ["c", 10], ["d", 10]]); // yesterday: a1 b2 c3 d4
    const d = rankDeltas(rows, prev); // today: b1 a2 c3 d4
    expect(d.get("b")).toBe(1);
    expect(d.get("a")).toBe(-1);
    expect(d.get("c")).toBe(0);
    expect(d.get("d")).toBe(0);
  });
  it("new users (not in snapshot) count as 0 stars", () => {
    const d = rankDeltas([{ uid: "x", stars: 5, questionsDone: 0 }, { uid: "y", stars: 1, questionsDone: 0 }], new Map([["y", 9]]));
    expect(d.get("x")).toBe(1); // was 2nd (0 stars vs y's 9), now 1st
    expect(d.get("y")).toBe(-1);
  });
  it("no snapshot → all zero", () => expect([...rankDeltas(rows, null).values()].every((v) => v === 0)).toBe(true));
  it("buildEntries: ranks, medals, profile fallback, startRank", () => {
    const e = buildEntries(rows, {
      prevStars: null,
      profiles: new Map([["b", { displayName: "Bee", cat: { colorId: "color-ginger", hatId: "hat-cap" } }]]),
      medals: new Map([["b", "gold" as const]]),
      startRank: 101,
    });
    expect(e[0]).toMatchObject({ uid: "b", rank: 101, displayName: "Bee", medal: "gold", rankDelta: 0 });
    expect(e[1].displayName).toBe("Player");
    expect(e[1].medal).toBeUndefined();
  });
  it("medal winners: top 3 with stars > 0", () => {
    expect(pickMedalWinners(rows).map((w) => [w.uid, w.medal])).toEqual([["b", "gold"], ["a", "silver"], ["c", "bronze"]]);
    expect(pickMedalWinners([{ uid: "z", stars: 0, questionsDone: 3 }])).toEqual([]);
    expect(pickMedalWinners([{ uid: "z", stars: 2, questionsDone: 3 }])).toHaveLength(1);
  });
});

const good = (over: object = {}) => ({
  attemptId: "attempt-12345678", grade: "P6", contentVersion: "abc", subtopicId: "p6-fractions-adding-fractions", level: 2, completed: true, finishedAt: 1,
  answers: [1, 2, 3, 4, 5].map((i) => ({ questionId: `q${i}`, correct: true, skipped: false, firstTryCorrect: true })), ...over,
});

describe("validateLevelResult", () => {
  it("counts questions right on the first try (first-time stars)", () => {
    const answers = good().answers.map((a, i) => ({ ...a, firstTryCorrect: i !== 1 }));
    const v = validateLevelResult(good({ answers }));
    expect(v.ok && v.firstTryCorrect).toBe(4);
  });
  it("an unfinished attempt still reports its first-try answers", () => {
    const v = validateLevelResult(good({ completed: false, answers: [{ questionId: "q1", correct: true, skipped: false, firstTryCorrect: true }] }));
    expect(v.ok && v.firstTryCorrect).toBe(1);
    expect(v.ok && v.attemptedIds).toEqual(["q1"]);
  });
  it("rejects answers without firstTryCorrect", () => {
    const v = validateLevelResult(good({ answers: [1, 2, 3, 4, 5].map((i) => ({ questionId: `q${i}`, correct: true, skipped: false })) }));
    expect(v.ok).toBe(false);
  });
  it("rejects completed with too few correct", () => {
    const v = validateLevelResult(good({ answers: [{ questionId: "q1", correct: true, skipped: false, firstTryCorrect: true }] }));
    expect(v.ok).toBe(false);
  });
  it("duplicate question ids don't count twice", () => {
    const v = validateLevelResult(good({ answers: Array.from({ length: 6 }, () => ({ questionId: "q1", correct: true, skipped: false, firstTryCorrect: true })) }));
    expect(v.ok).toBe(false);
  });
  it("counts non-skipped answers as questionsDone", () => {
    const v = validateLevelResult(good({ answers: [...good().answers, { questionId: "q9", correct: false, skipped: true, firstTryCorrect: false }, { questionId: "q8", correct: false, skipped: false, firstTryCorrect: false }] }));
    expect(v.ok && v.questionsDone).toBe(6);
  });
  it.each([
    ["attemptId", { attemptId: "x" }], ["grade", { grade: "P3" }], ["level", { level: 4 }], ["subtopic", { subtopicId: "../etc" }],
    ["answers", { answers: "no" }], ["completed", { completed: "yes" }],
  ])("rejects bad %s", (_n, over) => expect(validateLevelResult(good(over)).ok).toBe(false));
  it("rejects null", () => expect(validateLevelResult(null).ok).toBe(false));
  it("content version gate", () => {
    expect(isContentVersionAccepted(undefined, "x")).toBe(true);
    expect(isContentVersionAccepted(["a"], "a")).toBe(true);
    expect(isContentVersionAccepted(["a"], "b")).toBe(false);
  });
});

describe("validatePurchase", () => {
  const cap = STORE_ITEMS.find((i) => i.id === "hat-cap")!;
  it("ok", () => expect(validatePurchase({ item: cap, inventory: [], balance: 10 })).toEqual({ ok: true, newBalance: 2 }));
  it("exact balance", () => expect(validatePurchase({ item: cap, inventory: [], balance: cap.price })).toMatchObject({ ok: true, newBalance: 0 }));
  it("not enough stars", () => expect(validatePurchase({ item: cap, inventory: [], balance: 7 })).toMatchObject({ ok: false, code: "failed-precondition" }));
  it("cannot buy twice", () => expect(validatePurchase({ item: cap, inventory: ["hat-cap"], balance: 99 })).toMatchObject({ ok: false, code: "already-exists" }));
  it("unknown item", () => expect(validatePurchase({ item: STORE_ITEMS.find((i) => i.id === "nope"), inventory: [], balance: 99 })).toMatchObject({ ok: false, code: "not-found" }));
  it("price comes from the catalogue, free items cost 0", () => {
    const black = STORE_ITEMS.find((i) => i.id === "color-black")!;
    expect(validatePurchase({ item: black, inventory: [], balance: 0 })).toMatchObject({ ok: true, newBalance: 0 });
  });
});

describe("validateReferral", () => {
  it("ok", () => expect(validateReferral({ callerUid: "b", referrerUid: "a", alreadyRedeemed: false }).ok).toBe(true));
  it("self", () => expect(validateReferral({ callerUid: "a", referrerUid: "a", alreadyRedeemed: false })).toMatchObject({ ok: false, code: "invalid-argument" }));
  it("once per account", () => expect(validateReferral({ callerUid: "b", referrerUid: "a", alreadyRedeemed: true })).toMatchObject({ ok: false, code: "already-exists" }));
  it("unknown code", () => expect(validateReferral({ callerUid: "b", referrerUid: null, alreadyRedeemed: false })).toMatchObject({ ok: false, code: "not-found" }));
});

describe("friends + codes", () => {
  const base = { fromUid: "a", toUid: "b", alreadyFriends: false, forwardPending: false, reversePending: false };
  it("ok", () => expect(validateFriendRequest(base)).toEqual({ ok: true, autoAccept: false }));
  it("self", () => expect(validateFriendRequest({ ...base, toUid: "a" }).ok).toBe(false));
  it("already friends", () => expect(validateFriendRequest({ ...base, alreadyFriends: true }).ok).toBe(false));
  it("duplicate", () => expect(validateFriendRequest({ ...base, forwardPending: true }).ok).toBe(false));
  it("mutual request auto-accepts", () => expect(validateFriendRequest({ ...base, reversePending: true })).toEqual({ ok: true, autoAccept: true }));
  it("unknown code", () => expect(validateFriendRequest({ ...base, toUid: null }).ok).toBe(false));
  it("pairId is order independent", () => expect(pairId("b", "a")).toBe(pairId("a", "b")));
  it("friend codes: alphabet, length, normalization", () => {
    const code = makeFriendCode((n) => n - 1);
    expect(isFriendCode(code)).toBe(true);
    expect(normalizeFriendCode(" ab-cd 23 ")).toBe("ABCD23");
    expect(isFriendCode("ABCDEFG0")).toBe(false);
  });
});

describe("revenuecat", () => {
  const now = 1_000_000;
  const ev = (type: string, extra: object = {}) => ({ id: "e1", type, app_user_id: "uid1", entitlement_ids: ["unlimited"], expiration_at_ms: now + 1000, event_timestamp_ms: now, ...extra });
  it("INITIAL_PURCHASE / RENEWAL / UNCANCELLATION activate", () => {
    for (const t of ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION"]) {
      expect(mapRevenueCatEvent(ev(t), now)!.patch).toMatchObject({ unlimited: true, willRenew: true });
    }
  });
  it("CANCELLATION keeps access until expiry", () => {
    expect(mapRevenueCatEvent(ev("CANCELLATION"), now)!.patch).toMatchObject({ unlimited: true, willRenew: false });
    expect(mapRevenueCatEvent(ev("CANCELLATION", { expiration_at_ms: now - 1 }), now)!.patch.unlimited).toBe(false);
  });
  it("EXPIRATION deactivates", () => expect(mapRevenueCatEvent(ev("EXPIRATION"), now)!.patch).toMatchObject({ unlimited: false, willRenew: false }));
  it("expired purchase event isn't active", () => expect(mapRevenueCatEvent(ev("RENEWAL", { expiration_at_ms: now - 5 }), now)!.patch.unlimited).toBe(false));
  it("ignores other types, other entitlements, anonymous users", () => {
    expect(mapRevenueCatEvent(ev("TEST"), now)).toBeNull();
    expect(mapRevenueCatEvent(ev("RENEWAL", { entitlement_ids: ["other"] }), now)).toBeNull();
    expect(mapRevenueCatEvent(ev("RENEWAL", { app_user_id: "$RCAnonymousID:abc" }), now)).toBeNull();
  });
  it("falls back to alias for uid", () => expect(pickUid({ app_user_id: "$RCAnonymousID:x", aliases: ["$RCAnonymousID:x", "real"] })).toBe("real"));
  it("isActiveAt", () => { expect(isActiveAt(null, now)).toBe(true); expect(isActiveAt(now - 1, now)).toBe(false); });
  it("auth header", () => {
    expect(authHeaderMatches("s3cret", "s3cret", timingSafeEqual)).toBe(true);
    expect(authHeaderMatches("Bearer s3cret", "s3cret", timingSafeEqual)).toBe(true);
    expect(authHeaderMatches("nope", "s3cret", timingSafeEqual)).toBe(false);
    expect(authHeaderMatches(undefined, "s3cret", timingSafeEqual)).toBe(false);
    expect(authHeaderMatches("x", "", timingSafeEqual)).toBe(false);
  });
});

describe("integration seams", () => {
  it("isSubscribed ignores expired or missing entitlements", () => {
    const now = utc("2026-10-01T00:00:00Z");
    expect(isSubscribed(undefined, now)).toBe(false);
    expect(isSubscribed({ unlimited: false }, now)).toBe(false);
    expect(isSubscribed({ unlimited: true, expiresAt: now - 1 }, now)).toBe(false);
    expect(isSubscribed({ unlimited: true, expiresAt: now + 1 }, now)).toBe(true);
    expect(isSubscribed({ unlimited: true }, now)).toBe(true);
  });
  it("leaderboard entries expose only colour + hat of the cat look", () => {
    const profiles = new Map([["a", { displayName: "A", cat: { name: "Secret", colorId: "color-ginger", hatId: "hat-cap" } }]]);
    const [e] = buildEntries([{ uid: "a", stars: 1, questionsDone: 1 }], { prevStars: null, profiles: profiles as never, medals: new Map() });
    expect(e.cat).toEqual({ colorId: "color-ginger", hatId: "hat-cap" });
  });
  it("a skipped-then-corrected question still counts once the student got it right (client sends skipped=false)", () => {
    // Skipping is not an answer, so a question skipped and then answered right is still right on the first try.
    const answers = ["q1", "q2", "q3", "q4", "q5"].map((questionId) => ({ questionId, correct: true, skipped: false, firstTryCorrect: true }));
    const v = validateLevelResult({ attemptId: "abcdefgh-1234", grade: "P6", contentVersion: "v1", subtopicId: "p6-fractions-x1", level: 2, answers, completed: true, finishedAt: 1 });
    expect(v.ok && v.firstTryCorrect).toBe(5);
  });
});

describe("mini-game stars", () => {
  const round = (over: object = {}) => ({ attemptId: "round-12345678", grade: "P6", mode: "challenge", finishedAt: 1, answers: [{ questionId: "a", correct: true }], ...over });
  it("validates a round", () => {
    expect(validateMinigameResult(round()).ok).toBe(true);
    expect(validateMinigameResult(round({ mode: "practice" })).ok).toBe(false);
    expect(validateMinigameResult(round({ answers: [{ questionId: "a" }] })).ok).toBe(false);
  });
  it("+1 per new question answered right; re-attempts and repeats give nothing", () => {
    const answers = [
      { questionId: "a", correct: true }, { questionId: "b", correct: true }, { questionId: "c", correct: false },
      { questionId: "c", correct: true }, { questionId: "a", correct: true },
    ];
    expect(minigameStars(answers, new Set(["b"]))).toBe(1); // only a (b attempted before, c wrong on its first go)
  });
});

describe("claimQuest", () => {
  it("needs enough lifetime stars, once", () => {
    expect(validateClaimQuest({ questId: "quest-25", totalStars: 24, claimed: [], inventory: ["color-black"] }).ok).toBe(false);
    const v = validateClaimQuest({ questId: "quest-25", totalStars: 25, claimed: [], inventory: ["color-black"] });
    expect(v.ok && v.inventory).toEqual(["color-black", "color-rose"]);
    expect(v.ok && v.claimed).toEqual(["quest-25"]);
    expect(validateClaimQuest({ questId: "quest-25", totalStars: 99, claimed: ["quest-25"], inventory: [] }).ok).toBe(false);
    expect(validateClaimQuest({ questId: "nope", totalStars: 999, claimed: [], inventory: [] }).ok).toBe(false);
  });
});
