import { describe, expect, it } from "vitest";
import { applyLevelResult, emptyGradeProgress } from "./unlock";
import { isTopicInView, topicSummary } from "./topicPicker";

const L = ["a", "b", "c", "d", "e"];
const idsOf = () => ({ ids: L, total: 5 });

describe("topic picker", () => {
  it("counts levels done and stars on a map", () => {
    let p = emptyGradeProgress("P6", ["t"]);
    expect(topicSummary(p, ["s1", "s2"], idsOf)).toEqual({ done: 0, total: 6, stars: 0, totalStars: 30 });
    p = applyLevelResult(p, "s1", 1, L, L, 1);
    p = applyLevelResult(p, "s2", 1, ["a", "b"], L, 2);
    expect(topicSummary(p, ["s1", "s2"], idsOf)).toEqual({ done: 1, total: 6, stars: 7, totalStars: 30 });
    expect(topicSummary(undefined, ["s1"], idsOf).done).toBe(0);
  });
  it("marks the maps in view", () => {
    expect(isTopicInView(2, 2, 2)).toBe(true);
    expect(isTopicInView(3, 2, 2)).toBe(true);
    expect(isTopicInView(4, 2, 2)).toBe(false);
    expect(isTopicInView(1, 2, 1)).toBe(false);
  });
});
