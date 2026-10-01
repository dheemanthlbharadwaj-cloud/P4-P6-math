import { describe, expect, it } from "vitest";
import { newStats, richToPlain, tokenize } from "../src/tokenizer";

const T = (s: string) => tokenize(s);

describe("tokenizer", () => {
  it("plain text", () => expect(T("hello")).toEqual([{ t: "text", v: "hello" }]));
  it("fullwidth dollar is plain text, never math", () => {
    expect(T("It costs ＄5 and ＄6.")).toEqual([{ t: "text", v: "It costs ＄5 and ＄6." }]);
  });
  it("inline math with frac", () => {
    expect(T("Find $\\frac{3}{4}$ of 20")).toEqual([
      { t: "text", v: "Find " },
      { t: "frac", n: [{ t: "text", v: "3" }], d: [{ t: "text", v: "4" }] },
      { t: "text", v: " of 20" },
    ]);
  });
  it("dfrac", () => expect(T("$\\dfrac{1}{2}$")[0]).toMatchObject({ t: "frac" }));
  it("mixed number", () => {
    expect(T("$2\\frac{1}{3}$")).toEqual([{ t: "frac", w: "2", n: [{ t: "text", v: "1" }], d: [{ t: "text", v: "3" }] }]);
  });
  it("mixed number keeps preceding text", () => {
    const t = T("$x = 12\\frac{1}{2}$");
    expect(t[0]).toEqual({ t: "text", v: "x = " });
    expect(t[1]).toMatchObject({ t: "frac", w: "12" });
  });
  it("decimal before frac is not a mixed number", () => {
    expect(T("$0.5\\frac{1}{2}$")[1]).not.toHaveProperty("w");
  });
  it("times / div", () => expect(richToPlain(T("$3 \\times 4 \\div 2$"))).toBe("3 × 4 ÷ 2"));
  it("degrees both forms", () => {
    expect(richToPlain(T("$60^\\circ$"))).toBe("60°");
    expect(richToPlain(T("$60^{\\circ}$"))).toBe("60°");
    expect(richToPlain(T("$60\\circ$"))).toBe("60°");
  });
  it("pi, angle, le, ge, neq, cdot", () => {
    expect(richToPlain(T("$\\pi \\angle ABC \\le \\ge \\neq \\cdot$"))).toBe("π ∠ ABC ≤ ≥ ≠ ·");
  });
  it("sqrt", () => expect(T("$\\sqrt{16}$")).toEqual([{ t: "sqrt", v: [{ t: "text", v: "16" }] }]));
  it("sup and sub", () => {
    expect(T("$x^{2}$")).toEqual([{ t: "text", v: "x" }, { t: "sup", v: [{ t: "text", v: "2" }] }]);
    expect(T("$a_1$")).toEqual([{ t: "text", v: "a" }, { t: "sub", v: [{ t: "text", v: "1" }] }]);
    expect(T("$cm^2$")[1]).toMatchObject({ t: "sup" });
  });
  it("text and left/right", () => expect(richToPlain(T("$\\left( 3 + 4 \\right) \\text{ cm}$"))).toBe("( 3 + 4 )  cm"));
  it("percent", () => expect(richToPlain(T("$25\\%$"))).toBe("25%"));
  it("newlines become br", () => expect(T("a\nb")).toEqual([{ t: "text", v: "a" }, { t: "br" }, { t: "text", v: "b" }]));
  it("literal \\n sequence becomes br", () => expect(T("a\\nb")).toContainEqual({ t: "br" }));
  it("unknown commands stripped and counted", () => {
    const stats = newStats();
    const t = tokenize("$\\foo 3 + \\bar \\foo$", stats);
    expect(richToPlain(t)).toBe("foo 3 + bar foo");
    expect(stats.unknownCommands.get("foo")).toBe(2);
    expect(stats.unknownCommands.get("bar")).toBe(1);
  });
  it("unbalanced $ is kept literally", () => expect(richToPlain(T("costs $5 only"))).toBe("costs $5 only"));
  it("nested frac in frac", () => {
    const t = T("$\\frac{\\frac{1}{2}}{3}$")[0];
    expect(t).toMatchObject({ t: "frac", n: [{ t: "frac" }] });
  });
  it("null/empty", () => { expect(tokenize(null)).toEqual([]); expect(tokenize("")).toEqual([]); });
});

describe("stripQuestionNumber", () => {
  it("removes the paper's question number", async () => {
    const { stripQuestionNumber } = await import("../src/source");
    expect(stripQuestionNumber("6. What is the reading?")).toBe("What is the reading?");
    expect(stripQuestionNumber("Q12) Find x.")).toBe("Find x.");
    expect(stripQuestionNumber("44. By rounding")).toBe("By rounding");
  });
  it("keeps numbers that are part of the question", async () => {
    const { stripQuestionNumber } = await import("../src/source");
    expect(stripQuestionNumber("6.5 kg of rice")).toBe("6.5 kg of rice");
    expect(stripQuestionNumber("6 boys share 3 pizzas.")).toBe("6 boys share 3 pizzas.");
  });
});
