import { describe, expect, it } from "vitest";
import {
  buildUserRow, checkAdmin, checkAssignableTeacher, checkNotSelf, hasPasswordLogin, makePassword, parseUserQuery, validateAdminSaveClass,
  validateSaveTeacher, validateUidFlag, type AuthLike,
} from "../src/logic/admin";

const q = (raw: unknown) => {
  const r = parseUserQuery(raw);
  return r.ok ? r.query : r;
};

describe("parseUserQuery", () => {
  it("recognises a friend code in any case, with dashes or spaces", () => {
    expect(q("abcd2345")).toEqual({ kind: "friendCode", value: "ABCD2345" });
    expect(q(" ABCD-2345 ")).toEqual({ kind: "friendCode", value: "ABCD2345" });
    expect(q("abcd 2345")).toEqual({ kind: "friendCode", value: "ABCD2345" });
  });
  it("recognises an email, lower-cased", () => {
    expect(q("  Ms.Tan@School.edu.sg ")).toEqual({ kind: "email", value: "ms.tan@school.edu.sg" });
  });
  it("rejects a malformed email", () => {
    expect(q("a@b")).toMatchObject({ ok: false, code: "invalid-argument" });
    expect(q("two words@x.com")).toMatchObject({ ok: false });
  });
  it("treats anything else id-shaped as a uid", () => {
    expect(q("k3JdU9aPqRZx0Lm2Vb7Nc5Tw1Yh8")).toEqual({ kind: "uid", value: "k3JdU9aPqRZx0Lm2Vb7Nc5Tw1Yh8" });
    // 8 characters with a 0/O/1/I are not a friend code, so they fall through to uid
    expect(q("ABCD0123")).toEqual({ kind: "uid", value: "ABCD0123" });
  });
  it("rejects empty, non-string, huge and path-like input", () => {
    for (const bad of ["", "   ", undefined, 5, null, "a/b", "../x", "x".repeat(300), "a b c d e f g h i j k l m n o p q r s t u v w x y z 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789"]) {
      expect(parseUserQuery(bad).ok).toBe(false);
    }
  });
});

describe("makePassword", () => {
  it("is at least 16 readable characters with every class, no look-alikes", () => {
    for (let i = 0; i < 200; i++) {
      const p = makePassword();
      expect(p.length).toBeGreaterThanOrEqual(16);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).not.toMatch(/[0OIl1]/);
    }
  });
  it("never goes below 16 and honours a longer length", () => {
    expect(makePassword(4)).toHaveLength(16);
    expect(makePassword(24)).toHaveLength(24);
  });
  it("differs between calls", () => {
    expect(new Set(Array.from({ length: 50 }, () => makePassword())).size).toBe(50);
  });
  it("uses the injected random source", () => {
    expect(makePassword(16, () => 0)).toBe(makePassword(16, () => 0));
  });
});

describe("access checks", () => {
  it("checkAdmin needs an active admin doc", () => {
    expect(checkAdmin(null)).toMatchObject({ ok: false, code: "permission-denied", message: "Not an admin" });
    expect(checkAdmin({ active: false })).toMatchObject({ ok: false, code: "permission-denied" });
    expect(checkAdmin({ active: "yes" })).toMatchObject({ ok: false });
    expect(checkAdmin({ active: true })).toEqual({ ok: true });
  });
  it("checkNotSelf refuses the caller's own uid", () => {
    expect(checkNotSelf("a1", "a1")).toMatchObject({ ok: false, code: "failed-precondition" });
    expect(checkNotSelf("a1", "t1")).toEqual({ ok: true });
  });
  it("a class can only go to an existing, active teacher", () => {
    expect(checkAssignableTeacher(null)).toMatchObject({ ok: false, code: "not-found" });
    expect(checkAssignableTeacher({ active: false })).toMatchObject({ ok: false, code: "failed-precondition" });
    expect(checkAssignableTeacher({ active: true })).toEqual({ ok: true });
  });
});

describe("validators", () => {
  it("validateSaveTeacher tidies and checks email and name", () => {
    expect(validateSaveTeacher({ email: " Ms.Tan@School.edu.sg ", name: "  Ms   Tan " })).toEqual({ ok: true, email: "ms.tan@school.edu.sg", name: "Ms Tan" });
    expect(validateSaveTeacher({ email: "nope", name: "X" }).ok).toBe(false);
    expect(validateSaveTeacher({ email: "a@b.sg", name: "" }).ok).toBe(false);
    expect(validateSaveTeacher({ email: "a@b.sg", name: "x".repeat(61) }).ok).toBe(false);
    expect(validateSaveTeacher(null).ok).toBe(false);
  });
  it("validateAdminSaveClass needs a valid teacherUid on top of the teacher rules", () => {
    expect(validateAdminSaveClass({ name: "6 Courage", grade: "P6", teacherUid: "t1" })).toEqual({ ok: true, id: undefined, name: "6 Courage", grade: "P6", teacherUid: "t1" });
    expect(validateAdminSaveClass({ id: "c1", name: "6 Courage", grade: "P6", teacherUid: "t1" })).toMatchObject({ ok: true, id: "c1" });
    expect(validateAdminSaveClass({ name: "6 Courage", grade: "P6" }).ok).toBe(false);
    expect(validateAdminSaveClass({ name: "6 Courage", grade: "P6", teacherUid: "a/b" }).ok).toBe(false);
    expect(validateAdminSaveClass({ name: "", grade: "P6", teacherUid: "t1" }).ok).toBe(false);
    expect(validateAdminSaveClass({ name: "x", grade: "P9", teacherUid: "t1" }).ok).toBe(false);
  });
  it("validateUidFlag wants a uid and a real boolean", () => {
    expect(validateUidFlag({ uid: "u1", active: false }, "active")).toEqual({ ok: true, uid: "u1", value: false });
    expect(validateUidFlag({ uid: "u1", disabled: true }, "disabled")).toMatchObject({ ok: true, value: true });
    expect(validateUidFlag({ uid: "u1", active: "false" }, "active").ok).toBe(false);
    expect(validateUidFlag({ uid: "u1" }, "disabled").ok).toBe(false);
    expect(validateUidFlag({ uid: "", disabled: true }, "disabled").ok).toBe(false);
  });
});

describe("buildUserRow", () => {
  const auth: AuthLike = {
    uid: "u1", email: "kid@x.com", displayName: "Auth Name", disabled: false, providerData: [{ providerId: "password" }],
    metadata: { creationTime: "Mon, 05 Oct 2026 01:00:00 GMT", lastSignInTime: "Tue, 06 Oct 2026 01:00:00 GMT" },
  };
  it("a student row", () => {
    const r = buildUserRow(auth, { fullName: "Mia Lim", friendCode: "ABCD2345", grade: "P6", classIds: ["c1", 5, "c2"] }, undefined);
    expect(r).toMatchObject({ uid: "u1", displayName: "Mia Lim", email: "kid@x.com", providers: ["password"], friendCode: "ABCD2345", grade: "P6", classIds: ["c1", "c2"], disabled: false, isTeacher: false });
    expect(r.teacherActive).toBeUndefined();
    expect(r.createdAt).toBe(Date.parse("2026-10-05T01:00:00Z"));
    expect(r.lastSignInAt).toBe(Date.parse("2026-10-06T01:00:00Z"));
  });
  it("a teacher row falls back to the teacher name, then the Auth name", () => {
    expect(buildUserRow(auth, undefined, { name: "Ms Tan", active: false })).toMatchObject({ displayName: "Ms Tan", isTeacher: true, teacherActive: false, classIds: [] });
    expect(buildUserRow(auth, undefined, undefined).displayName).toBe("Auth Name");
    expect(buildUserRow({ ...auth, displayName: undefined, email: undefined, metadata: {} }, undefined, undefined)).toMatchObject({ displayName: "" });
  });
  it("ignores an unknown grade", () => {
    expect(buildUserRow(auth, { grade: "P9" }, undefined).grade).toBeUndefined();
  });
  it("hasPasswordLogin", () => {
    expect(hasPasswordLogin(["password", "google.com"])).toBe(true);
    expect(hasPasswordLogin(["google.com"])).toBe(false);
  });
});

describe("callable wiring (admin)", () => {
  it("the ten admin callables are exported from index.ts and served by the Netlify handler", async () => {
    const fs = await import("node:fs");
    const url = await import("node:url");
    const here = url.fileURLToPath(new URL(".", import.meta.url));
    const names = ["adminGetOverview", "adminSaveTeacher", "adminSetTeacherActive", "adminResetPassword", "adminFindUser", "adminSetUserDisabled", "adminSaveClass", "adminDeleteClass", "adminAddStudent", "adminRemoveStudent"];
    const handler = fs.readFileSync(here + "../../netlify/handler.mjs", "utf8");
    const index = fs.readFileSync(here + "../src/index.ts", "utf8");
    const api = fs.readFileSync(here + "../../../packages/shared/src/api.ts", "utf8");
    for (const n of names) {
      expect(handler, n).toMatch(new RegExp(`"${n}"`));
      expect(index, n).toMatch(new RegExp(`\\b${n}\\b`));
      expect(api, n).toMatch(new RegExp(`"${n}"`));
    }
  });
});
