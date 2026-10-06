import { describe, expect, it } from "vitest";
import { applyLevelResult, emptyGradeProgress, isLevelUnlocked, nextMapLevel, isTopicUnlocked, mergeGradeProgress, unlockTopic } from "./unlock";
import { mergeWrong, wrongDocsToPush } from "./wrongSync";
import { answer, isDone, isFirstTry, skip, startSession, toAnswers, correctCount } from "./levelSession";

describe("level unlock", () => {
  it("opens a level only when the previous level of every subtopic on the map is done; completion is sticky", () => {
    const map = ["s1", "s2"];
    let p = emptyGradeProgress("P6", ["fractions"]);
    expect(isLevelUnlocked(p, map, 1)).toBe(true);
    expect(isLevelUnlocked(p, map, 2)).toBe(false);
    p = applyLevelResult(p, "s1", 1, 3, false, 1);
    expect(isLevelUnlocked(p, map, 2)).toBe(false);
    p = applyLevelResult(p, "s1", 1, 5, true, 2);
    expect(isLevelUnlocked(p, map, 2)).toBe(false); // s2 Level 1 still open
    p = applyLevelResult(p, "s2", 1, 5, true, 3);
    expect(isLevelUnlocked(p, map, 2)).toBe(true);
    expect(isLevelUnlocked(p, map, 3)).toBe(false);
    p = applyLevelResult(p, "s1", 1, 1, false, 4);
    expect(p.levels["s1#1"]).toMatchObject({ completed: true, bestCorrect: 5, completedAt: 2 });
  });
  it("next map level walks the map order and stops at a locked level", () => {
    const map = ["s1", "s2"];
    let p = emptyGradeProgress("P6");
    expect(nextMapLevel(p, map, "s1", 1)).toEqual({ subtopicId: "s2", level: 1 });
    p = applyLevelResult(p, "s1", 1, 5, true, 1);
    expect(nextMapLevel(p, map, "s2", 1)).toBeNull(); // s1 done, s2 not: Level 2 still locked
    p = applyLevelResult(p, "s2", 1, 5, true, 2);
    expect(nextMapLevel(p, map, "s2", 1)).toEqual({ subtopicId: "s1", level: 2 });
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
      { questionId: "a", correct: true, skipped: false, firstTryCorrect: false }, // wrong on the first try: no star
      { questionId: "b", correct: true, skipped: false, firstTryCorrect: true },
    ]);
  });
  it("a skip is not a try: a skipped question answered right counts as right first time", () => {
    let s = startSession(["a", "b"]);
    s = skip(s);
    expect(isFirstTry(s, "a")).toBe(true);
    s = answer(s, true); // b
    s = answer(s, true); // a
    expect(toAnswers(s, ["a", "b"]).map((x) => x.firstTryCorrect)).toEqual([true, true]);
  });
  it("skip moves to the end and is flagged", () => {
    let s = startSession(["a", "b", "c"]);
    s = skip(s);
    expect(s.queue).toEqual(["b", "c", "a"]);
    expect(s.skipped.a).toBe(true);
    expect(skip(startSession(["z"])).queue).toEqual(["z"]);
  });
});

describe("level session answers for the server", () => {
  it("a skipped-then-answered question is sent as done, not skipped (server only counts non-skipped correct)", () => {
    let s = startSession(["a", "b"]);
    s = skip(s);
    s = answer(s, true); // b
    s = answer(s, true); // a
    expect(toAnswers(s, ["a", "b"]).every((x) => x.correct && !x.skipped)).toBe(true);
  });
});

describe("progress merge (restore / multi-device)", () => {
  it("merges by max and never drops completion or topics", () => {
    const a = applyLevelResult(emptyGradeProgress("P6", ["ratio"]), "s1", 1, 5, true, 10);
    const b = applyLevelResult(applyLevelResult(emptyGradeProgress("P6", ["fractions"]), "s1", 1, 2, false, 20), "s2", 1, 3, false, 20);
    const m = mergeGradeProgress(a, b);
    expect(m.unlockedTopics.sort()).toEqual(["fractions", "ratio"]);
    expect(m.levels["s1#1"]).toEqual({ completed: true, bestCorrect: 5, completedAt: 10 });
    expect(m.levels["s2#1"]).toEqual({ completed: false, bestCorrect: 3 });
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
