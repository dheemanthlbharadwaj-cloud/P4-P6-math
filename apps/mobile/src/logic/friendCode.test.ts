import { describe, expect, it } from "vitest";
import { normalizeFriendCode } from "./friendCode";

describe("normalizeFriendCode", () => {
  it("trims, removes inner spaces and upper-cases", () => {
    expect(normalizeFriendCode("  ab c-12 ")).toBe("ABC-12");
    expect(normalizeFriendCode("")).toBe("");
  });
});
