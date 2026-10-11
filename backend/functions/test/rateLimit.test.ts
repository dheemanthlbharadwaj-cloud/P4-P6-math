import { describe, expect, it } from "vitest";
import { PER_MINUTE, RateLimiter, TOTAL_PER_MINUTE } from "../src/logic/rateLimit.js";

describe("RateLimiter", () => {
  it("allows up to the function's limit per minute, then refuses until the window passes", () => {
    let t = 0;
    const rl = new RateLimiter(() => t);
    const n = PER_MINUTE.deleteAccount;
    for (let i = 0; i < n; i++) expect(rl.allow("a", "deleteAccount")).toBe(true);
    expect(rl.allow("a", "deleteAccount")).toBe(false);
    expect(rl.allow("b", "deleteAccount")).toBe(true); // other accounts unaffected
    t += 60_000;
    expect(rl.allow("a", "deleteAccount")).toBe(true);
  });
  it("caps all functions together per account", () => {
    const rl = new RateLimiter(() => 0);
    const fns = Object.keys(PER_MINUTE);
    let allowed = 0;
    for (let i = 0; i < TOTAL_PER_MINUTE + 50; i++) if (rl.allow("a", fns[i % fns.length])) allowed++;
    expect(allowed).toBeLessThanOrEqual(TOTAL_PER_MINUTE);
  });
});
