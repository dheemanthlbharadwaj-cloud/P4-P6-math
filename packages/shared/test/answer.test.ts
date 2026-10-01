import { describe, expect, it } from "vitest";
import { checkAnswer, markQuestion, normalizeInput } from "../src/answer";
import type { AnswerSpec, Question } from "../src/types";

const num = (value: number, extra: Partial<Extract<AnswerSpec, { kind: "number" }>> = {}): AnswerSpec => ({ kind: "number", value, ...extra });
const frac = (n: number, d: number, whole?: number): AnswerSpec => ({ kind: "fraction", num: n, den: d, whole });

describe("normalizeInput", () => {
  it("trims and lowercases", () => expect(normalizeInput("  ABC  ")).toBe("abc"));
  it("removes commas in numbers", () => expect(normalizeInput("1,234,567")).toBe("1234567"));
  it("unifies unicode minus", () => expect(normalizeInput("−5")).toBe("-5"));
  it("strips fullwidth dollar", () => expect(normalizeInput("＄3.50")).toBe("3.50"));
  it("strips ascii dollar", () => expect(normalizeInput("$ 3.50")).toBe("3.50"));
  it("strips cm²", () => expect(normalizeInput("24 cm²")).toBe("24"));
  it("strips cm2", () => expect(normalizeInput("24cm2")).toBe("24"));
  it("strips km/h", () => expect(normalizeInput("60 km/h")).toBe("60"));
  it("strips %", () => expect(normalizeInput("25%")).toBe("25"));
  it("strips degree", () => expect(normalizeInput("45°")).toBe("45"));
  it("expands vulgar fraction in mixed", () => expect(normalizeInput("1½")).toBe("1 1/2"));
  it("tightens ratio spacing", () => expect(normalizeInput("3 : 4")).toBe("3:4"));
  it("keeps plain words", () => expect(normalizeInput("Isosceles Triangle")).toBe("isosceles triangle"));
  it("handles empty/undefined", () => expect(normalizeInput("")).toBe(""));
});

describe("number specs", () => {
  it("integer", () => expect(checkAnswer(num(12), "12")).toBe(true));
  it("integer wrong", () => expect(checkAnswer(num(12), "13")).toBe(false));
  it("decimal trailing zero", () => expect(checkAnswer(num(2.5), "2.50")).toBe(true));
  it("leading dot decimal", () => expect(checkAnswer(num(0.5), ".5")).toBe(true));
  it("comma thousands", () => expect(checkAnswer(num(1250), "1,250")).toBe(true));
  it("negative with unicode minus", () => expect(checkAnswer(num(-3), "−3")).toBe(true));
  it("negative with space", () => expect(checkAnswer(num(-3), "- 3")).toBe(true));
  it("unit stripped", () => expect(checkAnswer(num(24, { unit: "cm²" }), "24 cm²")).toBe(true));
  it("unit omitted", () => expect(checkAnswer(num(24, { unit: "cm²" }), "24")).toBe(true));
  it("unknown trailing word tolerated", () => expect(checkAnswer(num(5), "5 apples")).toBe(true));
  it("money fullwidth", () => expect(checkAnswer(num(3.5, { unit: "$" }), "＄3.50")).toBe(true));
  it("money tolerance", () => expect(checkAnswer(num(3.5, { unit: "$" }), "$3.504")).toBe(true));
  it("money out of tolerance", () => expect(checkAnswer(num(3.5, { unit: "$" }), "$3.52")).toBe(false));
  it("non-money no tolerance", () => expect(checkAnswer(num(3.5), "3.504")).toBe(false));
  it("explicit tolerance", () => expect(checkAnswer(num(3.14, { tolerance: 0.01 }), "3.145")).toBe(true));
  it("fraction input to number spec", () => expect(checkAnswer(num(0.5), "1/2")).toBe(true));
  it("mixed number to number spec", () => expect(checkAnswer(num(1.5), "1 1/2")).toBe(true));
  it("percent", () => expect(checkAnswer(num(25, { unit: "%" }), "25 %")).toBe(true));
  it("x = prefix", () => expect(checkAnswer(num(7), "x = 7")).toBe(true));
  it("empty is wrong", () => expect(checkAnswer(num(0), "")).toBe(false));
  it("garbage is wrong", () => expect(checkAnswer(num(5), "abc")).toBe(false));
  it("zero", () => expect(checkAnswer(num(0), "0")).toBe(true));
});

describe("fraction specs", () => {
  it("simple", () => expect(checkAnswer(frac(3, 4), "3/4")).toBe(true));
  it("spaces around slash", () => expect(checkAnswer(frac(3, 4), "3 / 4")).toBe(true));
  it("unsimplified equivalent", () => expect(checkAnswer(frac(1, 2), "2/4")).toBe(true));
  it("decimal equivalent", () => expect(checkAnswer(frac(1, 2), "0.5")).toBe(true));
  it("mixed spec, mixed input", () => expect(checkAnswer(frac(1, 2, 1), "1 1/2")).toBe(true));
  it("mixed spec, improper input", () => expect(checkAnswer(frac(1, 2, 1), "3/2")).toBe(true));
  it("mixed spec, decimal input", () => expect(checkAnswer(frac(1, 2, 1), "1.5")).toBe(true));
  it("mixed spec, unicode half", () => expect(checkAnswer(frac(1, 2, 1), "1½")).toBe(true));
  it("mixed spec, unicode half spaced", () => expect(checkAnswer(frac(1, 2, 2), "2 ½")).toBe(true));
  it("improper spec, mixed input", () => expect(checkAnswer(frac(7, 3), "2 1/3")).toBe(true));
  it("wrong", () => expect(checkAnswer(frac(3, 4), "3/5")).toBe(false));
  it("zero denominator", () => expect(checkAnswer(frac(3, 4), "3/0")).toBe(false));
  it("negative", () => expect(checkAnswer(frac(-3, 4), "−3/4")).toBe(true));
  it("with unit", () => expect(checkAnswer({ kind: "fraction", num: 1, den: 2, unit: "kg" }, "1/2 kg")).toBe(true));
  it("1/3 vs truncated decimal rejected", () => expect(checkAnswer(frac(1, 3), "0.33")).toBe(false));
});

describe("ratio specs", () => {
  const r: AnswerSpec = { kind: "ratio", terms: [3, 4] };
  it("plain", () => expect(checkAnswer(r, "3:4")).toBe(true));
  it("spaces", () => expect(checkAnswer(r, "3 : 4")).toBe(true));
  it("unsimplified rejected", () => expect(checkAnswer(r, "6:8")).toBe(false));
  it("wrong order", () => expect(checkAnswer(r, "4:3")).toBe(false));
  it("three terms", () => expect(checkAnswer({ kind: "ratio", terms: [3, 4, 5] }, "3:4:5")).toBe(true));
  it("term count mismatch", () => expect(checkAnswer({ kind: "ratio", terms: [3, 4, 5] }, "3:4")).toBe(false));
  it("fullwidth colon", () => expect(checkAnswer(r, "3：4")).toBe(true));
});

describe("text specs", () => {
  const t: AnswerSpec = { kind: "text", accepted: ["Isosceles triangle", "isosceles"] };
  it("case-insensitive", () => expect(checkAnswer(t, "ISOSCELES TRIANGLE")).toBe(true));
  it("space-insensitive", () => expect(checkAnswer(t, "  isosceles   triangle ")).toBe(true));
  it("alt accepted", () => expect(checkAnswer(t, "Isosceles")).toBe(true));
  it("trailing period", () => expect(checkAnswer(t, "isosceles.")).toBe(true));
  it("wrong", () => expect(checkAnswer(t, "scalene")).toBe(false));
  it("algebra expression", () => expect(checkAnswer({ kind: "text", accepted: ["3x+2"] }, "3x + 2")).toBe(true));
  it("does not strip units on text", () => expect(checkAnswer({ kind: "text", accepted: ["5 m"] }, "5 m")).toBe(true));
});

const baseQ: Omit<Question, "type"> = { id: "q", grade: "P6", year: 2024, topic: "t", topics: [], subtopicId: "s", difficulty: "LV1", paper: "Paper 2", calculatorAllowed: true, stem: [], autoMarkable: true };

describe("markQuestion", () => {
  it("mcq correct", () => {
    const q: Question = { ...baseQ, type: "mcq", correctOption: "3" };
    expect(markQuestion(q, ["3"])).toEqual({ correct: true, perPart: [true] });
  });
  it("mcq wrong", () => {
    const q: Question = { ...baseQ, type: "mcq", correctOption: "3" };
    expect(markQuestion(q, ["2"]).correct).toBe(false);
  });
  it("open multi-part", () => {
    const q: Question = {
      ...baseQ, type: "open",
      parts: [
        { part: "a", answer: num(5), display: "5" },
        { part: "b", answer: frac(1, 2), display: "1/2" },
      ],
    };
    expect(markQuestion(q, ["5", "0.5"])).toEqual({ correct: true, perPart: [true, true] });
    expect(markQuestion(q, ["5", "1/3"])).toEqual({ correct: false, perPart: [true, false] });
    expect(markQuestion(q, ["5"])).toEqual({ correct: false, perPart: [true, false] });
  });
  it("open without parts is never correct", () => {
    expect(markQuestion({ ...baseQ, type: "open" }, ["x"]).correct).toBe(false);
  });
});
