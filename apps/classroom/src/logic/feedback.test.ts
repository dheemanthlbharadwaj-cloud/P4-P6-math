import { describe, expect, it } from "vitest";
import { showAnswerLines, showCorrectOption } from "./feedback";

describe("wrong answers never reveal the right answer", () => {
  it("nothing to show before marking", () => {
    expect(showCorrectOption(null)).toBe(false);
    expect(showAnswerLines(undefined)).toBe(false);
  });
  it("wrong: no green option, no answer line, even if the screen asks for answers", () => {
    expect(showCorrectOption({ correct: false })).toBe(false);
    expect(showAnswerLines({ correct: false, showAnswer: true })).toBe(false);
  });
  it("right: green option and (when asked) answer lines as before", () => {
    expect(showCorrectOption({ correct: true })).toBe(true);
    expect(showAnswerLines({ correct: true, showAnswer: true })).toBe(true);
    expect(showAnswerLines({ correct: true })).toBe(false);
  });
  it("practice show-answer mode (correct: true, showAnswer) is unchanged", () => {
    const shown = { correct: true, perPart: [], showAnswer: true as const };
    expect(showCorrectOption(shown)).toBe(true);
    expect(showAnswerLines(shown)).toBe(true);
  });
});
