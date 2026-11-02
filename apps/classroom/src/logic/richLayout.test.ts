import { describe, expect, it } from "vitest";
import { chunkText, glueOperators, needsRowLayout, splitLines } from "./richLayout";

describe("RichText helpers", () => {
  it("chunks text into words that keep trailing spaces", () => {
    expect(chunkText(" × ")).toEqual([" ", "× "]);
    expect(chunkText("a bc  d")).toEqual(["a ", "bc  ", "d"]);
    expect(chunkText("").length).toBe(0);
    expect(chunkText("ab cd").join("")).toBe("ab cd");
  });
  it("only stacked tokens need the row layout", () => {
    expect(needsRowLayout([{ t: "text", v: "x" }, { t: "br" }])).toBe(false);
    expect(needsRowLayout([{ t: "frac", n: [], d: [] }])).toBe(true);
    expect(needsRowLayout([{ t: "sup", v: [] }])).toBe(true);
  });
  it("splits lines at br", () => {
    expect(splitLines([{ t: "text", v: "a" }, { t: "br" }, { t: "text", v: "b" }])).toEqual([[{ t: "text", v: "a" }], [{ t: "text", v: "b" }]]);
  });
  it("glues operators between operands with no-break spaces", () => {
    const N = "\u00A0";
    expect(glueOperators("equal to 2 ÷ 7?")).toBe(`equal to 2${N}÷${N}7?`);
    expect(glueOperators("3 + 4 × 5 − a = b")).toBe(`3${N}+${N}4${N}×${N}5${N}−${N}a${N}=${N}b`);
    expect(glueOperators(" × ")).toBe(" × ");
    expect(glueOperators("1 + 2 + 3")).toBe(`1${N}+${N}2${N}+${N}3`);
    expect(glueOperators("no operators here")).toBe("no operators here");
  });
  it("chunks keep a glued expression in one chunk", () => {
    expect(chunkText(glueOperators("is 2 ÷ 7?")).length).toBe(2);
  });
});
