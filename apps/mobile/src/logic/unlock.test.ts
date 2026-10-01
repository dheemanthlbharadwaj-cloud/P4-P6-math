import { describe, expect, it } from "vitest";
import { applyLevelResult, emptyGradeProgress, isLevelUnlocked, isTopicUnlocked, unlockTopic } from "./unlock";
import { answer, isDone, skip, startSession, toAnswers, correctCount } from "./levelSession";

describe("level unlock", () => {
  it("unlocks sequentially and completion is sticky", () => {
    let p = emptyGradeProgress("P6", ["fractions"]);
    expect(isLevelUnlocked(p, "s1", 1)).toBe(true);
    expect(isLevelUnlocked(p, "s1", 2)).toBe(false);
    p = applyLevelResult(p, "s1", 1, 3, false, 1);
    expect(isLevelUnlocked(p, "s1", 2)).toBe(false);
    p = applyLevelResult(p, "s1", 1, 5, true, 2);
    expect(isLevelUnlocked(p, "s1", 2)).toBe(true);
    expect(isLevelUnlocked(p, "s1", 3)).toBe(false);
    p = applyLevelResult(p, "s1", 1, 1, false, 3);
    expect(p.levels["s1#1"]).toMatchObject({ completed: true, bestCorrect: 5, completedAt: 2 });
    expect(isLevelUnlocked(p, "s2", 2)).toBe(false);
  });
  it("unlocks topics idempotently", () => {
    let p = emptyGradeProgress("P6");
    expect(isTopicUnlocked(p, "ratio")).toBe(false);
    p = unlockTopic(unlockTopic(p, "ratio"), "ratio");
    expect(p.unlockedTopics).toEqual(["ratio"]);
  });
});

describe("level session", () => {
  it("wrong answers return to the end; completes when all right", () => {
    let s = startSession(["a", "b"]);
    s = answer(s, false);
    expect(s.queue).toEqual(["b", "a"]);
    s = answer(s, true);
    s = answer(s, true);
    expect(isDone(s)).toBe(true);
    expect(correctCount(s)).toBe(2);
    expect(toAnswers(s, ["a", "b"])).toEqual([
      { questionId: "a", correct: true, skipped: false },
      { questionId: "b", correct: true, skipped: false },
    ]);
  });
  it("skip moves to the end and is flagged", () => {
    let s = startSession(["a", "b", "c"]);
    s = skip(s);
    expect(s.queue).toEqual(["b", "c", "a"]);
    expect(s.skipped.a).toBe(true);
    expect(skip(startSession(["z"])).queue).toEqual(["z"]);
  });
});
