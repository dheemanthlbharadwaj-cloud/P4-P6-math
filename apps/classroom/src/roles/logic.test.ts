import { describe, expect, it } from "vitest";
import { areasFor, startArea } from "./logic";

describe("classroom areas", () => {
  it("Student always; Teacher / Admin only with the role; all three while the roles are unknown", () => {
    expect(areasFor("ready", { teacher: false, admin: false })).toEqual(["student"]);
    expect(areasFor("ready", { teacher: true, admin: false })).toEqual(["student", "teacher"]);
    expect(areasFor("ready", { teacher: true, admin: true })).toEqual(["student", "teacher", "admin"]);
    expect(areasFor("unknown", { teacher: false, admin: false })).toEqual(["student", "teacher", "admin"]);
  });
  it("goes to the last area used if still allowed, else the only one, else asks", () => {
    expect(startArea(["student", "teacher"], "teacher", true)).toBe("teacher");
    expect(startArea(["student"], "admin", true)).toBe("student"); // lost the admin role
    expect(startArea(["student"], null, true)).toBe("student");
    expect(startArea(["student", "teacher", "admin"], null, true)).toBeNull();
    expect(startArea(["student", "teacher", "admin"], null, false)).toBeNull(); // roles unknown: ask
    expect(startArea(["student", "teacher", "admin"], "admin", false)).toBe("admin");
  });
});
