import { describe, expect, it } from "vitest";
import { isCorrect } from "../src/logic/marking.js";
import { CONTENT } from "../src/content/index.js";

// Real questions from the generated answer key (src/content, built from the app's P6 bundle).
const P6 = CONTENT.P6;

describe("server-side marking", () => {
  it("has the P6 answer key and every level's questions", () => {
    expect(P6).toBeDefined();
    const levels = Object.values(P6!.levels);
    expect(levels.length).toBeGreaterThan(100);
    for (const ids of levels) for (const id of ids) expect(P6!.answers[id], id).toBeDefined(); // every level question can be marked
  });
  it("marks MCQs by the option key", () => {
    expect(isCorrect(P6, "2021_ACS_P1A_Q01", ["4"])).toBe(true);
    expect(isCorrect(P6, "2021_ACS_P1A_Q01", ["3"])).toBe(false);
  });
  it("marks open answers with the shared answer checker", () => {
    expect(isCorrect(P6, "2021_ACS_P1_Q16", ["19"])).toBe(true);
    expect(isCorrect(P6, "2021_ACS_P1_Q16", ["18"])).toBe(false);
  });
  it("an unknown question is never correct", () => {
    expect(isCorrect(P6, "nope", ["1"])).toBe(false);
    expect(isCorrect(undefined, "2021_ACS_P1A_Q01", ["4"])).toBe(false);
  });
});
