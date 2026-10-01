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
