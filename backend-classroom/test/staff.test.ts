import { describe, expect, it } from "vitest";
import { checkAdmin, makePassword, rolesOf, validateTeacher } from "../src/logic/staff";
import { originAllowed } from "../src/logic/origin";

describe("staff rules", () => {
  it("only ACTIVE records open an area", () => {
    expect(rolesOf(null, null)).toEqual({ teacher: false, admin: false });
    expect(rolesOf({ active: true }, { active: false })).toEqual({ teacher: true, admin: false });
    expect(rolesOf(undefined, { active: true })).toEqual({ teacher: false, admin: true });
    expect(checkAdmin({ active: "yes" })).toMatchObject({ ok: false, code: "permission-denied" });
  });
  it("teacher input", () => {
    expect(validateTeacher({ name: " Teacher  Lisa ", email: " Lisa@School.SG " })).toEqual({ ok: true, name: "Teacher Lisa", email: "lisa@school.sg" });
    expect(validateTeacher({ name: "", email: "a@b.c" })).toMatchObject({ ok: false });
    expect(validateTeacher({ name: "A", email: "nope" })).toMatchObject({ ok: false });
    expect(validateTeacher({ name: "A", email: "a@b.c", uid: "u1" })).toMatchObject({ uid: "u1" });
  });
  it("passwords: 16+ readable chars with every class", () => {
    const p = makePassword();
    expect(p).toHaveLength(16);
    expect(p).toMatch(/[A-Z]/); expect(p).toMatch(/[a-z]/); expect(p).toMatch(/[2-9]/);
    expect(p).not.toMatch(/[01OlI]/);
  });
  it("browsers may call only from the classroom site or local builds", () => {
    expect(originAllowed("https://catapult-classroom.web.app")).toBe(true);
    expect(originAllowed("http://localhost:8081")).toBe(true);
    expect(originAllowed("https://catapult-mathletes.web.app")).toBe(false);
    expect(originAllowed(null)).toBe(true); // no Origin = not a browser
  });
});
