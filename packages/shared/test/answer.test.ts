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

describe("number answers with unit words (kids type the number, the number and unit, or a unit variant)", () => {
  const cupcakes = num(22, { unit: "cupcakes" });
  it("accepts the bare number and the number with the unit (singular, plural, odd case/spacing)", () => {
    for (const a of ["22", "22 cupcakes", "22 cupcake", "22cupcakes", " 22   Cupcakes ", "22.0"]) expect(checkAnswer(cupcakes, a), a).toBe(true);
    for (const a of ["21", "22 and 3", "2 2", "cupcakes", ""]) expect(checkAnswer(cupcakes, a), a).toBe(false);
  });
  it("units typed several ways", () => {
    expect(checkAnswer(num(120, { unit: "cm²" }), "120 cm2")).toBe(true);
    expect(checkAnswer(num(120, { unit: "cm²" }), "120 cm^2")).toBe(true);
    expect(checkAnswer(num(120, { unit: "cm²" }), "120 sq cm")).toBe(true);
    expect(checkAnswer(num(3.5, { unit: "kg" }), "3.5kg")).toBe(true);
    expect(checkAnswer(num(15, { unit: "%" }), "15 %")).toBe(true);
    expect(checkAnswer(num(15, { unit: "%" }), "15%")).toBe(true);
    expect(checkAnswer(num(6, { unit: "years old" }), "6 years old")).toBe(true);
    expect(checkAnswer(num(6, { unit: "years old" }), "6")).toBe(true);
    expect(checkAnswer(num(15, { unit: "L/min" }), "15 L/min")).toBe(true);
    expect(checkAnswer(num(32, { unit: "¢" }), "32¢")).toBe(true);
    expect(checkAnswer(num(32, { unit: "¢" }), "32 cents")).toBe(true);
    expect(checkAnswer(num(32, { unit: "¢" }), "32")).toBe(true);
  });
  it("money forms", () => {
    const m = num(40, { tolerance: 0.005, unit: "$" });
    for (const a of ["40", "$40", "＄40", "40 ＄", "40.00", "$ 40", "S$40"]) expect(checkAnswer(m, a), a).toBe(true);
    expect(checkAnswer(num(12.5, { tolerance: 0.005, unit: "$" }), "$12.50")).toBe(true);
  });
  it("space-grouped thousands (Singapore style)", () => {
    expect(normalizeInput("204 920")).toBe("204920");
    expect(checkAnswer(num(204920, { tolerance: 0.005, unit: "$" }), "$204 920")).toBe(true);
    expect(checkAnswer(num(204920), "204920")).toBe(true);
    // not grouped: mixed numbers, ratios, lists and 4+ digit groups are left alone
    expect(normalizeInput("2 1/2")).toBe("2 1/2");
    expect(normalizeInput("3 : 4")).toBe("3:4");
    expect(normalizeInput("12 3456")).toBe("12 3456");
    expect(checkAnswer(frac(1, 2, 2), "2 1/2")).toBe(true);
    expect(checkAnswer({ kind: "ratio", terms: [3, 4] }, "3 : 4")).toBe(true);
  });
});

describe("forgiving text answers", () => {
  const text = (...accepted: string[]): AnswerSpec => ({ kind: "text", accepted });
  const ok = (spec: AnswerSpec, ...rs: string[]) => rs.forEach((r) => expect(checkAnswer(spec, r), r).toBe(true));
  const no = (spec: AnswerSpec, ...rs: string[]) => rs.forEach((r) => expect(checkAnswer(spec, r), r).toBe(false));
  const row = text("Row 96, Column C");
  it("case, punctuation, spacing and &", () => {
    ok(text("isosceles triangle"), "Isosceles Triangle", "isosceles  triangle.", "ISOSCELES TRIANGLE!");
    ok(text("Tom and Jerry"), "tom & jerry", "Tom, and Jerry");
    ok(text("6:45 p.m."), "6:45pm", "6:45 PM", "6:45 p.m", "6:45 p m");
    ok(text("0.525"), "0.525");
    no(text("0.525"), "0 525", "525");
    no(text("isosceles triangle"), "triangle", "scalene triangle", "isosceles");
  });
  it("key tokens: Row 96, Column C", () => {
    ok(row, "Row 96, Column C", "row 96 column c", "96, C", "96 c", "Row 96 Col C", "R96 C", "r 96 c", "ROW 96, COLUMN C.", "the answer is row 96 column c");
    no(row, "C", "96", "Row 95, Column C", "Row 96, Column D", "Row 69 Column C", "Column C Row 96", "Row 96", "Column C", "Row 96, Column C, 5", "not row 96 column c", "96 D");
  });
  it("lists keep their order and every item", () => {
    ok(text("15 and 21"), "15, 21", "15 & 21", "15 21", "15 and 21");
    no(text("15 and 21"), "21 and 15", "15", "21", "15 and 22", "15, 21, 3");
    ok(text("1, 2, 3, 6"), "1 2 3 6", "1,2,3,6", "1, 2, 3 and 6");
    no(text("1, 2, 3, 6"), "1, 2, 3", "1, 2, 6", "6, 3, 2, 1");
    ok(text("9/8, 2/3, 5/9"), "9/8 2/3 5/9", "9/8,2/3,5/9");
    no(text("9/8, 2/3, 5/9"), "9/8, 5/9, 2/3", "9/8, 2/3");
  });
  it("times and durations", () => {
    ok(text("2 p.m."), "2pm", "2 PM", "2 p.m", "2 p.m.");
    no(text("2 p.m."), "2", "2 a.m.", "3 p.m.", "pm");
    ok(text("10 h 45 min"), "10h45min", "10 h 45 min", "10 H 45 MIN", "10 h 45");
    no(text("10 h 45 min"), "10 h 54 min", "10 45", "45 min", "10 h");
    ok(text("2 m 84 cm"), "2m84cm", "2 m 84");
    no(text("2 m 84 cm"), "284 cm", "2 84");
    ok(text("13.00 to 15.00"), "13.00 to 15.00", "13.00 15.00");
  });
  it("algebra", () => {
    ok(text("5y - 10"), "5y-10", "5 y - 10", "5y - 10", "5Y - 10", "5y−10");
    no(text("5y - 10"), "5y + 10", "10 - 5y", "5y", "y - 10", "5x - 10", "5y - 11", "50y - 10");
    ok(text("3a/5"), "3a/5", "3 a / 5");
    no(text("3a/5"), "5a/3", "3a/6");
    ok(text("(7y-4) kg"), "(7y-4) kg", "(7y-4)");
    no(text("2(y+1)"), "2y+1");
    no(text("(7y-4) kg"), "(7y-4)kg g", "7y+4");
  });
  it("units and word answers with data", () => {
    ok(text("40 white squares; 16 grey squares"), "40 white squares, 16 grey squares", "40 white 16 grey", "40, 16");
    no(text("40 white squares; 16 grey squares"), "40 grey squares, 16 white squares", "16, 40", "40");
    ok(text("124 cm² and 1552 cm²"), "124 cm2 and 1552 cm2", "124 cm^2, 1552 cm^2", "124, 1552");
    ok(text("a right angle"), "right angle", "a right angle");
    no(text("a right angle"), "an acute angle");
    no(text("A and B"), "and B", "B");
  });
  it("any of several accepted answers", () => {
    const s = text("3", "3 or 5");
    ok(s, "3", "3 or 5", "3, 5");
    no(s, "5");
  });
  it("number, fraction and ratio checking is untouched", () => {
    expect(checkAnswer({ kind: "number", value: 22, unit: "cupcakes" }, "22")).toBe(true);
    expect(checkAnswer({ kind: "number", value: 22 }, "22 and 3")).toBe(false);
  });
});

describe("litre unit: ℓ, l and L are the same", () => {
  const text = (accepted: string[]): AnswerSpec => ({ kind: "text", accepted });
  it("a typed ℓ matches an accepted l answer, and the other way round", () => {
    expect(checkAnswer(text(["9 l 75 ml"]), "9 ℓ 75 ml")).toBe(true);
    expect(checkAnswer(text(["9 ℓ 75 ml"]), "9 l 75 ml")).toBe(true);
    expect(checkAnswer(text(["9 ℓ 75 ml"]), "9ℓ 75ml")).toBe(true);
  });
  it("ℓ with no space matches a numeric answer with an l unit", () => {
    expect(checkAnswer(num(9), "9ℓ")).toBe(true);
    expect(checkAnswer(num(9.075, { unit: "ℓ" }), "9.075 l")).toBe(true);
    expect(checkAnswer(num(9.075, { unit: "l" }), "9.075 L")).toBe(true);
    expect(checkAnswer(num(9.075), "9.075 ℓ")).toBe(true);
  });
  it("ℓ still does not match a different number", () => {
    expect(checkAnswer(num(9), "8ℓ")).toBe(false);
  });
});
