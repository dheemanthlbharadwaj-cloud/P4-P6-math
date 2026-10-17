import { describe, expect, it } from "vitest";
import { resolveProjects, verifyWithFallback } from "../src/logic/projects.js";

describe("resolveProjects", () => {
  it("legacy single project when STUDENT vars are absent", () => {
    const c = resolveProjects({ BACKEND_SERVICE_ACCOUNT_B64: "L", FIRESTORE_DATABASE_ID: "default" });
    expect(c).toMatchObject({ split: false, studentB64: "L", studentDatabaseId: "default", editorB64: "L", editorDatabaseId: "default" });
  });
  it("emulator defaults", () => {
    const c = resolveProjects({});
    expect(c).toMatchObject({ split: false, studentDatabaseId: "(default)", editorDatabaseId: "(default)" });
  });
  it("split projects", () => {
    const c = resolveProjects({ STUDENT_SERVICE_ACCOUNT_B64: "S", EDITOR_SERVICE_ACCOUNT_B64: "E", BACKEND_SERVICE_ACCOUNT_B64: "L", FIRESTORE_DATABASE_ID: "default", LEGACY_AUTH_PROJECT_ID: "primary-math-sg" });
    expect(c).toMatchObject({ split: true, studentB64: "S", studentDatabaseId: "(default)", editorB64: "E", editorDatabaseId: "default", legacyAuthProjectId: "primary-math-sg" });
  });
  it("split: editor falls back to the old key; database ids are configurable", () => {
    const c = resolveProjects({ STUDENT_SERVICE_ACCOUNT_B64: "S", BACKEND_SERVICE_ACCOUNT_B64: "L", STUDENT_DATABASE_ID: "x", EDITOR_DATABASE_ID: "y" });
    expect(c).toMatchObject({ editorB64: "L", studentDatabaseId: "x", editorDatabaseId: "y" });
  });
});

describe("verifyWithFallback", () => {
  const ok = (v: string) => async () => v;
  const bad = (m: string) => async () => { throw new Error(m); };
  it("uses the primary when it accepts", async () => expect(await verifyWithFallback(ok("p"), ok("l"), "t")).toBe("p"));
  it("falls back to the legacy verifier", async () => expect(await verifyWithFallback(bad("p"), ok("l"), "t")).toBe("l"));
  it("rejects with the primary error when both fail", async () => {
    await expect(verifyWithFallback(bad("p"), bad("l"), "t")).rejects.toThrow("p");
  });
  it("no legacy configured: primary error", async () => {
    await expect(verifyWithFallback(bad("p"), null, "t")).rejects.toThrow("p");
  });
});
