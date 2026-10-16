import { describe, expect, it } from "vitest";
import { chunkText, needsRowLayout, splitLines } from "./richLayout";

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
});
