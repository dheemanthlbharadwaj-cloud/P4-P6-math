import { describe, expect, it } from "vitest";
import { dailyQuestStates, validateDailyClaim } from "../src/logic/dailyQuests.js";
import { sgtDate, startOfSgtDay } from "../src/logic/dates.js";
import { PER_MINUTE } from "../src/logic/rateLimit.js";

describe("startOfSgtDay", () => {
  it("is 16:00 UTC the previous day", () => {
    expect(startOfSgtDay(Date.UTC(2026, 0, 15, 3, 0))).toBe(Date.UTC(2026, 0, 14, 16, 0)); // 11:00 SGT
    expect(startOfSgtDay(Date.UTC(2026, 0, 15, 16, 0))).toBe(Date.UTC(2026, 0, 15, 16, 0)); // exactly 00:00 SGT on the 16th
    expect(startOfSgtDay(Date.UTC(2026, 0, 15, 15, 59, 59))).toBe(Date.UTC(2026, 0, 14, 16, 0));
  });
  it("matches sgtDate's day", () => {
    const t = Date.UTC(2026, 2, 1, 20, 0); // 04:00 SGT on 2 Mar
    expect(sgtDate(t)).toBe("2026-03-02");
    expect(sgtDate(startOfSgtDay(t))).toBe("2026-03-02");
    expect(sgtDate(startOfSgtDay(t) - 1)).toBe("2026-03-01");
  });
});

describe("dailyQuestStates", () => {
  it("caps progress at target and reports claimed", () => {
    const s = dailyQuestStates({ answers: 17, friends: 0 }, ["answer-5"]);
    const by = Object.fromEntries(s.map((q) => [q.id, q]));
    expect(by["answer-5"]).toMatchObject({ progress: 5, target: 5, stars: 1, claimed: true });
    expect(by["answer-15"]).toMatchObject({ progress: 15, claimed: false });
    expect(by["answer-25"]).toMatchObject({ progress: 17, target: 25 });
    expect(by["add-friend"]).toMatchObject({ progress: 0, target: 1, stars: 2 });
  });
  it("friends quest uses friends count", () => expect(dailyQuestStates({ answers: 0, friends: 3 }, []).find((q) => q.id === "add-friend")!.progress).toBe(1));
});

describe("validateDailyClaim", () => {
  const p = { answers: 5, friends: 0 };
  it("ok", () => expect(validateDailyClaim({ questId: "answer-5", progress: p, claimed: [] })).toMatchObject({ ok: true }));
  it("unknown id", () => expect(validateDailyClaim({ questId: "nope", progress: p, claimed: [] })).toMatchObject({ ok: false, code: "invalid-argument" }));
  it("non-string id", () => expect(validateDailyClaim({ questId: undefined, progress: p, claimed: [] })).toMatchObject({ ok: false, code: "invalid-argument" }));
  it("not done", () => expect(validateDailyClaim({ questId: "answer-15", progress: p, claimed: [] })).toMatchObject({ ok: false, code: "failed-precondition", message: "not done yet" }));
  it("already claimed", () => expect(validateDailyClaim({ questId: "answer-5", progress: p, claimed: ["answer-5"] })).toMatchObject({ ok: false, code: "already-exists" }));
  it("friend quest", () => expect(validateDailyClaim({ questId: "add-friend", progress: { answers: 99, friends: 1 }, claimed: [] }).ok).toBe(true));
});

describe("rate limits", () => {
  it("daily quest callables are limited", () => expect([PER_MINUTE.getDailyQuests, PER_MINUTE.claimDailyQuest]).toEqual([20, 10]));
});
