import { describe, expect, it } from "vitest";
import { applyLevelResult, emptyGradeProgress, isLevelComplete, isLevelUnlocked, levelStarCount, nextMapLevel, isTopicUnlocked, mergeGradeProgress, unlockTopic } from "./unlock";

const L = ["a", "b", "c", "d", "e"];
import { mergeWrong, wrongDocsToPush } from "./wrongSync";

describe("level unlock", () => {
  it("opens a level only when the previous level of every subtopic on the map is done; completion is sticky", () => {
    const map = ["s1", "s2"];
    let p = emptyGradeProgress("P6", ["fractions"]);
    expect(isLevelUnlocked(p, map, 1)).toBe(true);
    expect(isLevelUnlocked(p, map, 2)).toBe(false);
    p = applyLevelResult(p, "s1", 1, ["a", "c", "e"], L, 1); // 3 of 5 stars
    expect(isLevelUnlocked(p, map, 2)).toBe(false);
    expect(levelStarCount(p, "s1", 1)).toBe(3);
    p = applyLevelResult(p, "s1", 1, ["b", "d"], L, 2); // the other 2: complete
    expect(p.levels["s1#1"]).toMatchObject({ completed: true, bestCorrect: 5, completedAt: 2, correctIds: L });
    expect(isLevelUnlocked(p, map, 2)).toBe(false); // s2 Level 1 still open
    p = applyLevelResult(p, "s2", 1, L, L, 3);
    expect(isLevelUnlocked(p, map, 2)).toBe(true);
    expect(isLevelUnlocked(p, map, 3)).toBe(false);
    p = applyLevelResult(p, "s1", 1, ["a"], L, 4); // a replay never undoes anything
    expect(p.levels["s1#1"]).toMatchObject({ completed: true, bestCorrect: 5, completedAt: 2 });
    expect(levelStarCount(p, "s1", 1)).toBe(5);
  });
  it("next map level walks the map order and stops at a locked level", () => {
    const map = ["s1", "s2"];
    let p = emptyGradeProgress("P6");
    expect(nextMapLevel(p, map, "s1", 1)).toEqual({ subtopicId: "s2", level: 1 });
    p = applyLevelResult(p, "s1", 1, L, L, 1);
    expect(nextMapLevel(p, map, "s2", 1)).toBeNull(); // s1 done, s2 not: Level 2 still locked
    p = applyLevelResult(p, "s2", 1, L, L, 2);
    expect(nextMapLevel(p, map, "s2", 1)).toEqual({ subtopicId: "s1", level: 2 });
  });
  it("unlocks topics idempotently", () => {
    let p = emptyGradeProgress("P6");
    expect(isTopicUnlocked(p, "ratio")).toBe(false);
    p = unlockTopic(unlockTopic(p, "ratio"), "ratio");
    expect(p.unlockedTopics).toEqual(["ratio"]);
  });
});

describe("progress merge (restore / multi-device)", () => {
  it("merges by max and never drops completion or topics", () => {
    const a = applyLevelResult(emptyGradeProgress("P6", ["ratio"]), "s1", 1, L, L, 10);
    const b = applyLevelResult(applyLevelResult(emptyGradeProgress("P6", ["fractions"]), "s1", 1, ["a", "b"], L, 20), "s2", 1, ["a", "b", "c"], L, 20);
    const m = mergeGradeProgress(a, b);
    expect(m.unlockedTopics.sort()).toEqual(["fractions", "ratio"]);
    expect(m.levels["s1#1"]).toEqual({ completed: true, bestCorrect: 5, completedAt: 10, correctIds: L });
    expect(m.levels["s2#1"]).toEqual({ completed: false, bestCorrect: 3, correctIds: ["a", "b", "c"] });
    expect("completedAt" in m.levels["s2#1"]).toBe(false); // Firestore cannot store undefined
    expect(mergeGradeProgress(a, undefined)).toBe(a);
  });
});

describe("wrong bookmark sync", () => {
  it("restores unknown questions, keeps local state for known ones", () => {
    const local = { byGrade: { P6: { q1: 5 } }, history: { P6: ["q1", "q2"] } };
    const m = mergeWrong(local, "P6", [
      { id: "q1", active: false, flaggedAt: 1 },
      { id: "q3", active: true, flaggedAt: 7 },
      { id: "q4", active: false, flaggedAt: 0 },
    ]);
    expect(m.byGrade.P6).toEqual({ q1: 5, q3: 7 });
    expect(m.history.P6?.sort()).toEqual(["q1", "q2", "q3", "q4"]);
  });
  it("pushes only what changed since the last sync", () => {
    const local = { byGrade: { P6: { q1: 5 } }, history: { P6: ["q1", "q2"] } };
    expect(wrongDocsToPush(local, "P6", new Map([["q1", true], ["q2", false]]))).toEqual([]);
    expect(wrongDocsToPush(local, "P6", new Map([["q1", false]]))).toEqual([
      { id: "q1", active: true, flaggedAt: 5 },
      { id: "q2", active: false, flaggedAt: 0 },
    ]);
  });
});

describe("retired questions in progress", () => {
  const active = ["a", "b", "c", "d"]; // "e" was retired
  const idsOf = (_s: string, l: number) => (l === 1 ? active : L);
  it("a level is complete once every current question has its star", () => {
    let p = emptyGradeProgress("P6");
    p = applyLevelResult(p, "s1", 1, ["a", "b", "c"], L, 1);
    expect(isLevelComplete(p, "s1", 1, idsOf)).toBe(false);
    p = applyLevelResult(p, "s1", 1, ["d"], L, 2); // 4 of 5 stars on the old list
    expect(p.levels["s1#1"].completed).toBe(false);
    expect(isLevelComplete(p, "s1", 1, idsOf)).toBe(true);
    expect(isLevelComplete(p, "s1", 1)).toBe(false); // without the active list the stored flag decides
    expect(isLevelUnlocked(p, ["s1"], 2, idsOf)).toBe(true);
    expect(isLevelUnlocked(p, ["s1"], 2)).toBe(false);
  });
  it("applyLevelResult with the active ids completes the level", () => {
    const p = applyLevelResult(emptyGradeProgress("P6"), "s1", 1, active, active, 1);
    expect(p.levels["s1#1"].completed).toBe(true);
  });
  it("a retired slot shows as a filled star; answers to retired questions don't count twice", () => {
    const cur = { ids: active, slots: 5 };
    expect(levelStarCount(undefined, "s1", 1, 5, cur)).toBe(1);
    let p = applyLevelResult(emptyGradeProgress("P6"), "s1", 1, ["a", "e"], L, 1);
    expect(levelStarCount(p, "s1", 1, 5, cur)).toBe(2); // a + the retired slot (e's own answer isn't counted again)
    p = applyLevelResult(p, "s1", 1, ["b", "c", "d"], L, 2);
    expect(levelStarCount(p, "s1", 1, 5, cur)).toBe(5);
    expect(levelStarCount(p, "s1", 1)).toBe(5);
  });
  it("next map level skips a level that is complete on the current list", () => {
    const p = applyLevelResult(emptyGradeProgress("P6"), "s1", 1, active, active, 1);
    expect(nextMapLevel(p, ["s1", "s2"], "s1", 1, idsOf)).toEqual({ subtopicId: "s2", level: 1 });
  });
});
