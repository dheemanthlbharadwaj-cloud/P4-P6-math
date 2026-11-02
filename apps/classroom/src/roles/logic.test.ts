import { describe, expect, it } from "vitest";
import { areasFor, isParentUid, startArea } from "./logic";

describe("classroom areas", () => {
  it("Teacher for teachers and admins, Admin for admins, nothing for others; both while unknown", () => {
    expect(areasFor("ready", { teacher: false, admin: false })).toEqual([]);
    expect(areasFor("ready", { teacher: true, admin: false })).toEqual(["teacher"]);
    expect(areasFor("ready", { teacher: false, admin: true })).toEqual(["teacher", "admin"]);
    expect(areasFor("unknown", { teacher: false, admin: false })).toEqual(["teacher", "admin"]);
  });
  it("goes to the last area used if still allowed, else Teacher; asks while unknown", () => {
    expect(startArea(["teacher", "admin"], "admin", true)).toBe("admin");
    expect(startArea(["teacher"], "admin", true)).toBe("teacher");
    expect(startArea([], null, true)).toBeNull();
    expect(startArea(["teacher", "admin"], null, false)).toBeNull();
    expect(startArea(["teacher", "admin"], "teacher", false)).toBe("teacher");
  });
  it("parent logins", () => {
    expect(isParentUid("parent_abc")).toBe(true);
    expect(isParentUid("abc")).toBe(false);
    expect(isParentUid(null)).toBe(false);
  });
});
