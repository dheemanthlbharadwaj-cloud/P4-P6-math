import { describe, expect, it } from "vitest";
import { checkAnswer } from "@p6/shared";
import { extractSpec, splitLetteredAnswer } from "../src/answerSpec";

describe("extractSpec", () => {
  it("integer", () => expect(extractSpec({ value: "12" }).spec).toEqual({ kind: "number", value: 12 }));
  it("decimal with unit field", () => expect(extractSpec({ value: "3.5", unit: "cm" }).spec).toEqual({ kind: "number", value: 3.5, unit: "cm" }));
  it("unit inside answer text", () => expect(extractSpec({ value: "24 cm²" }).spec).toMatchObject({ kind: "number", value: 24 }));
  it("commas", () => expect(extractSpec({ value: "1,250" }).spec).toEqual({ kind: "number", value: 1250 }));
  it("money with fullwidth symbol", () => {
    const r = extractSpec({ value: "＄3.50" });
    expect(r.spec).toEqual({ kind: "number", value: 3.5, tolerance: 0.005, unit: "$" });
    expect(r.display).toBe("＄3.50");
  });
  it("money via answer_symbol", () => expect(extractSpec({ value: "12", symbol: "＄" }).spec).toMatchObject({ tolerance: 0.005 }));
  it("fraction via answer_fraction", () => expect(extractSpec({ fraction: "3/4" }).spec).toEqual({ kind: "fraction", num: 3, den: 4 }));
  it("fraction latex", () => expect(extractSpec({ value: "$\\frac{3}{4}$" }).spec).toEqual({ kind: "fraction", num: 3, den: 4 }));
  it("mixed number latex", () => {
    const r = extractSpec({ value: "$2\\frac{1}{3}$" });
    expect(r.spec).toEqual({ kind: "fraction", num: 1, den: 3, whole: 2 });
    expect(checkAnswer(r.spec, "7/3")).toBe(true);
    expect(checkAnswer(r.spec, "2 1/3")).toBe(true);
  });
  it("negative mixed number is consistent", () => {
    const r = extractSpec({ value: "-1 1/2" });
    expect(checkAnswer(r.spec, "-1.5")).toBe(true);
  });
  it("ratio", () => expect(extractSpec({ value: "3 : 4" }).spec).toEqual({ kind: "ratio", terms: [3, 4] }));
  it("short text", () => {
    const r = extractSpec({ value: "isosceles triangle" });
    expect(r.spec).toEqual({ kind: "text", accepted: ["isosceles triangle"] });
    expect(r.autoMarkable).toBe(true);
  });
  it("explanation is not auto-markable", () => {
    const r = extractSpec({ value: "Because the two angles are equal, the triangle must be isosceles and so the third side is longer." });
    expect(r.autoMarkable).toBe(false);
  });
  it("missing answer is not auto-markable", () => expect(extractSpec({}).autoMarkable).toBe(false));
  it("spec accepts its own display", () => {
    for (const v of ["12", "＄3.50", "45°", "25%", "$\\frac{1}{2}$ kg", "3:4"]) {
      const r = extractSpec({ value: v });
      expect(checkAnswer(r.spec, r.display)).toBe(true);
    }
  });
});

describe("splitLetteredAnswer", () => {
  it("splits", () => expect(splitLetteredAnswer("(a) 5 cm, (b) 12")).toEqual([{ part: "a", value: "5 cm" }, { part: "b", value: "12" }]));
  it("null for single", () => expect(splitLetteredAnswer("5")).toBeNull());
});

describe("editor bank answer shapes", () => {
  it("uses answer_symbol when it is the only answer", () => {
    expect(extractSpec({ symbol: "10 1/2" })).toMatchObject({ autoMarkable: true, spec: { kind: "fraction", whole: 10, num: 1, den: 2 } });
    expect(extractSpec({ symbol: "5 : 4" })).toMatchObject({ autoMarkable: true, spec: { kind: "ratio", terms: [5, 4] } });
    expect(extractSpec({ symbol: "520%" })).toMatchObject({ autoMarkable: true, spec: { kind: "number", value: 520 } });
  });
  it("reads {numerator, denominator, whole} fraction objects", () => {
    expect(extractSpec({ fraction: { numerator: 3, denominator: 5, whole: 25 } })).toMatchObject({ autoMarkable: true, spec: { kind: "fraction", whole: 25, num: 3, den: 5 } });
    expect(extractSpec({ fraction: { numerator: 3, denominator: 14, whole: 0 } })).toMatchObject({ autoMarkable: true, spec: { kind: "fraction", num: 3, den: 14 } });
  });
  it("prefers the numeric value over a descriptive symbol", () => {
    expect(extractSpec({ value: 57.6, unit: "＄", symbol: "Banana — ＄57.60" })).toMatchObject({ autoMarkable: true, spec: { kind: "number", value: 57.6 } });
  });
  it("accepts short word answers as text", () => {
    for (const s of ["Kai", "2 p.m.", "True", "$5y+2$"]) expect(extractSpec({ symbol: s }).autoMarkable).toBe(true);
  });
  it("does not auto-mark drawing instructions", () => {
    expect(extractSpec({ symbol: "Drawing required: complete the trapezium PQRS in the square grid." }).autoMarkable).toBe(false);
  });
});

describe("number with unit words (answers stored as text before)", () => {
  const num = (value: number, unit?: string) => ({ kind: "number", value, ...(unit ? { unit } : {}) });
  it("22 cupcakes accepts 22 and 22 cupcakes", () => {
    const r = extractSpec({ value: "22 cupcakes" });
    expect(r.spec).toEqual(num(22, "cupcakes"));
    expect(r.display).toBe("22 cupcakes");
    expect(r.autoMarkable).toBe(true);
    expect(checkAnswer(r.spec, "22")).toBe(true);
    expect(checkAnswer(r.spec, "22 cupcakes")).toBe(true);
    expect(checkAnswer(r.spec, "23")).toBe(false);
  });
  it.each([
    ["6 years old", num(6, "years old")],
    ["16 l per hour", num(16, "l per hour")],
    ["15 L/min", num(15, "L/min")],
    ["27 grey circles", num(27, "grey circles")],
    ["32¢", num(32)],
  ])("%s", (v, spec) => {
    const r = extractSpec({ value: v });
    expect(r.spec).toEqual(spec);
    expect(checkAnswer(r.spec, r.display)).toBe(true);
  });
  it("money forms", () => {
    expect(extractSpec({ value: "40 ＄" }).spec).toEqual({ kind: "number", value: 40, tolerance: 0.005, unit: "$" });
    expect(extractSpec({ value: "$204 920" }).spec).toEqual({ kind: "number", value: 204920, tolerance: 0.005, unit: "$" });
  });
  it("already numeric answers are unchanged", () => {
    expect(extractSpec({ value: "3.5 kg" }).spec).toEqual({ kind: "number", value: 3.5 });
    expect(extractSpec({ value: "120 cm²" }).spec).toEqual({ kind: "number", value: 120 });
    expect(extractSpec({ value: "15 %" }).spec).toEqual({ kind: "number", value: 15 });
    expect(extractSpec({ value: "$12.50" }).spec).toEqual({ kind: "number", value: 12.5, tolerance: 0.005, unit: "$" });
  });
  it.each([
    "15 and 21", "2 p.m.", "6:45 p.m.", "10 h 45 min", "5y - 10", "5y+2", "40 white squares; 16 grey squares", "1, 2, 3, 6",
    "24 and 48", "12 p.m. to 1 p.m.", "2 triangular faces and 3 rectangular faces", "6A", "3x/0.6", "2 2/3 min (2 min 40 s)", "7 cm; 60 cm^2",
  ])("%s stays text", (v) => {
    expect(extractSpec({ value: v }).spec.kind).toBe("text");
  });
});

describe("money: only a currency symbol in the answer makes it money (not the $ that delimits LaTeX math)", () => {
  it("math-delimited answers are not money", () => {
    expect(extractSpec({ symbol: "$\\frac{7}{20}$" }).spec).toEqual({ kind: "fraction", num: 7, den: 20 });
    expect(extractSpec({ symbol: "$\\frac{7}{20}$ l" }).display).toBe("7/20 l");
    expect(extractSpec({ symbol: "$68^\\circ$" }).spec).toEqual({ kind: "number", value: 68 });
    expect(extractSpec({ symbol: "$68^\\circ$" }).display).toBe("68°");
    expect(extractSpec({ value: "24 cm^2", symbol: "$24$" }).spec).toEqual({ kind: "number", value: 24 });
  });
  it("real money stays money", () => {
    expect(extractSpec({ value: "＄3.50" }).spec).toEqual({ kind: "number", value: 3.5, tolerance: 0.005, unit: "$" });
    expect(extractSpec({ value: "12", symbol: "＄" }).spec).toMatchObject({ tolerance: 0.005, unit: "$" });
    expect(extractSpec({ value: "9000", unit: "＄" }).spec).toEqual({ kind: "number", value: 9000, unit: "＄" });
    expect(extractSpec({ value: "12", unit: "dollars" }).spec).toMatchObject({ tolerance: 0.005, unit: "$" });
  });
  it("algebra in a money question keeps its ＄, elsewhere it does not", () => {
    expect(extractSpec({ symbol: "$5p+4$", moneyContext: true }).display).toBe("＄5p+4");
    expect(extractSpec({ symbol: "$5p+4$" }).display).toBe("5p+4");
    expect(extractSpec({ symbol: "$2y+7$", unit: "cm", moneyContext: true }).display).toBe("2y+7 cm");
  });
});
