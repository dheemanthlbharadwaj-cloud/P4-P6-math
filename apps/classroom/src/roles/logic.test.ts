import { describe, expect, it } from "vitest";
import { areasFor, isParentUid } from "./logic";

describe("classroom areas", () => {
  it("one Teacher area for teachers and admins, nothing for others; Teacher while unknown", () => {
    expect(areasFor("ready", { teacher: false, admin: false })).toEqual([]);
    expect(areasFor("ready", { teacher: true, admin: false })).toEqual(["teacher"]);
    expect(areasFor("ready", { teacher: false, admin: true })).toEqual(["teacher"]);
    expect(areasFor("ready", { teacher: true, admin: true })).toEqual(["teacher"]);
    expect(areasFor("unknown", { teacher: false, admin: false })).toEqual(["teacher"]);
  });
  it("parent logins", () => {
    expect(isParentUid("parent_abc")).toBe(true);
    expect(isParentUid("abc")).toBe(false);
    expect(isParentUid(null)).toBe(false);
  });
});
