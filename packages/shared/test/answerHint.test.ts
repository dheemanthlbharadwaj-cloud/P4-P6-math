import { describe, expect, it } from "vitest";
import { answerFormatHint } from "../src/answerHint";
import type { AnswerPart, AnswerSpec } from "../src/types";

const part = (answer: AnswerSpec, display = ""): AnswerPart => ({ part: "", answer, display });
const text = (a: string) => answerFormatHint(part({ kind: "text", accepted: [a] }, a));

describe("answerFormatHint", () => {
  it("numbers", () => {
    expect(answerFormatHint(part({ kind: "number", value: 5 }))).toBe("Type a number");
    expect(answerFormatHint(part({ kind: "number", value: 22, unit: "cupcakes" }, "22 cupcakes"))).toBe("Type a number (cupcakes)");
    expect(answerFormatHint(part({ kind: "number", value: 12.5, tolerance: 0.005, unit: "$" }))).toBe("Type an amount in $, like 12.50");
    expect(answerFormatHint(part({ kind: "number", value: 9000, unit: "＄" }))).toBe("Type an amount in $, like 12.50");
    expect(answerFormatHint(part({ kind: "number", value: 15 }, "15%"))).toBe("Type a number (%)");
    expect(answerFormatHint(part({ kind: "number", value: 15, unit: "%" }))).toBe("Type a number (%)");
  });
  it("tidies odd units", () => {
    expect(answerFormatHint(part({ kind: "number", value: 5, unit: "litres #error-use-litre-symbol" }))).toBe("Type a number (litres)");
    expect(answerFormatHint(part({ kind: "number", value: 5, unit: "cm^2" }))).toBe("Type a number (cm²)");
    expect(answerFormatHint(part({ kind: "number", value: 5, unit: "cm2" }))).toBe("Type a number (cm²)");
    expect(answerFormatHint(part({ kind: "number", value: 5, unit: "steps; 08:00 to 09:00" }))).toBe("Type a number");
  });
  it("fractions and ratios", () => {
    expect(answerFormatHint(part({ kind: "fraction", num: 7, den: 20 }))).toBe("Type a fraction, like 3/4 or 1 1/2");
    expect(answerFormatHint(part({ kind: "fraction", num: 7, den: 20, unit: "l" }))).toBe("Type a fraction, like 3/4 or 1 1/2 (l)");
    expect(answerFormatHint(part({ kind: "ratio", terms: [3, 4] }))).toBe("Type a ratio, like 2 : 3");
    expect(answerFormatHint(part({ kind: "ratio", terms: [3, 4, 5] }))).toBe("Type a ratio, like 2 : 3 : 4");
  });
  it("text templates show the shape, not the answer", () => {
    expect(text("Row 96, Column C")).toBe("Type like: Row __, Column _");
    expect(text("15 and 21")).toBe("Type like: __ and __");
    expect(text("2 p.m.")).toBe("Type like: __ p.m.");
    expect(text("6:45 p.m.")).toBe("Type like: __:__ p.m.");
    expect(text("10 h 45 min")).toBe("Type like: __ h __ min");
    expect(text("1, 2, 3, 6")).toBe("Type like: __, __, __, __");
    expect(text("9/8, 2/3, 5/9")).toBe("Type like: __/__, __/__, __/__");
    expect(text("40 white squares; 16 grey squares")).toBe("Type like: __ white squares; __ grey squares");
    expect(text("A and C")).toBe("Type like: _ and _");
  });
  it("algebra and words-only answers", () => {
    expect(text("5y - 10")).toBe("Type an expression, like 3y + 2");
    expect(text("(7y-4) kg")).not.toContain("7");
    expect(text("3a/5")).toBe("Type an expression, like 3y + 2");
    expect(text("isosceles triangle")).toBe("Type your answer in words");
    expect(text("True")).toBe("Type your answer in words");
    expect(answerFormatHint(part({ kind: "text", accepted: [] }))).toBeNull();
  });
  it("never contains a digit or the answer's letters", () => {
    for (const a of ["Row 96, Column C", "15 and 21", "2 p.m.", "5y - 10", "124 cm² and 1552 cm²", "20th corner: 118; 21st corner: 129"]) {
      expect(text(a)!.replace(/like 3y \+ 2|like 2 : 3/, "")).not.toMatch(/\d/);
    }
  });
});
