import { describe, expect, it } from "vitest";
import { evaluate, formatResult } from "./calculator";

describe("calculator evaluator", () => {
  it("respects precedence and brackets", () => {
    expect(evaluate("2+3*4")).toBe(14);
    expect(evaluate("(2+3)×4")).toBe(20);
    expect(evaluate("10÷4")).toBe(2.5);
    expect(evaluate("2(3+4)")).toBe(14);
    expect(evaluate("-(2+3)*-2")).toBe(10);
    expect(evaluate("50%")).toBe(0.5);
    expect(evaluate("1.5+.5")).toBe(2);
  });
  it("rejects malformed input and never evaluates code", () => {
    expect(evaluate("")).toBeNull();
    expect(evaluate("2+")).toBeNull();
    expect(evaluate("(2+3")).toBeNull();
    expect(evaluate("1/0")).toBeNull();
    expect(evaluate("1..2+1")).toBeNull();
    expect(evaluate("process.exit()")).toBeNull();
    expect(evaluate("alert(1)")).toBeNull();
  });
  it("formats float noise away", () => {
    expect(formatResult(evaluate("0.1+0.2")!)).toBe("0.3");
  });
});
