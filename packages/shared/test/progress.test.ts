import { describe, expect, it } from "vitest";
import { mergeGradeProgress } from "../src/progress";

describe("mergeGradeProgress", () => {
  it("unions the questions with a star from both copies and keeps completion sticky", () => {
    const a = { grade: "P6" as const, unlockedTopics: ["t1"], levels: { "s#1": { completed: false, bestCorrect: 2, correctIds: ["a", "b"] } } };
    const b = { grade: "P6" as const, unlockedTopics: ["t2"], levels: { "s#1": { completed: true, bestCorrect: 3, correctIds: ["b", "c"], completedAt: 5 } } };
    const m = mergeGradeProgress(a, b);
    expect(m.unlockedTopics.sort()).toEqual(["t1", "t2"]);
    expect(m.levels["s#1"]).toEqual({ completed: true, bestCorrect: 3, completedAt: 5, correctIds: ["a", "b", "c"] });
  });
  it("leaves out correctIds when neither copy has any (Firestore rejects undefined)", () => {
    const a = { grade: "P6" as const, unlockedTopics: [], levels: { "s#1": { completed: false, bestCorrect: 0 } } };
    expect("correctIds" in mergeGradeProgress(a, a).levels["s#1"]).toBe(false);
  });
});
