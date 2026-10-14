import { describe, expect, it } from "vitest";
import type { GetQuestionPatchesResponse, QuestionPatch } from "@p6/shared";
import { emptyPatches, mergePatches, patchesForBundle, retiredIds } from "./patches";

const patch = (id: string, editedAt: string, retired = false, figureUrl?: string): QuestionPatch =>
  ({ id, editedAt, question: retired ? null : ({ id } as never), ...(figureUrl ? { figureUrl } : {}) });
const res = (patches: QuestionPatch[], until: string, bundleVersion = "v1"): GetQuestionPatchesResponse =>
  ({ grade: "P6", bundleVersion, until, patches, more: false });

describe("question patches store logic", () => {
  it("merges a response; the later editedAt wins, a tie takes the newer answer", () => {
    let s = mergePatches(undefined, "v1", res([patch("a", "2026-01-02"), patch("b", "2026-01-03")], "2026-01-03"));
    expect(Object.keys(s.byId)).toEqual(["a", "b"]);
    expect(s.until).toBe("2026-01-03");
    s = mergePatches(s, "v1", res([patch("a", "2026-01-01", true)], "2026-01-03")); // older edit: ignored
    expect(s.byId.a.question).not.toBeNull();
    s = mergePatches(s, "v1", res([patch("a", "2026-01-05", true), patch("b", "2026-01-03", false, "u")], "2026-01-05"));
    expect(s.byId.a.question).toBeNull();
    expect(s.byId.b.figureUrl).toBe("u");
    expect(s.until).toBe("2026-01-05");
  });
  it("never moves `until` back", () => {
    const s = mergePatches(mergePatches(undefined, "v1", res([], "2026-02-01")), "v1", res([], ""));
    expect(s.until).toBe("2026-02-01");
  });
  it("drops the stored patches when the bundle version differs and starts from since ''", () => {
    const old = mergePatches(undefined, "v1", res([patch("a", "2026-01-02")], "2026-01-02"));
    expect(patchesForBundle(old, "v1")).toBe(old);
    expect(patchesForBundle(old, "v2")).toEqual(emptyPatches("v2"));
    const next = mergePatches(old, "v2", res([patch("c", "2026-03-01")], "2026-03-01", "v2"));
    expect(Object.keys(next.byId)).toEqual(["c"]);
    expect(next.bundleVersion).toBe("v2");
  });
  it("ignores an answer for another bundle", () => {
    const s = mergePatches(undefined, "v1", res([patch("a", "2026-01-02")], "2026-01-02", "v9"));
    expect(s).toEqual(emptyPatches("v1"));
  });
  it("lists retired ids", () => {
    const s = mergePatches(undefined, "v1", res([patch("a", "1"), patch("b", "2", true)], "2"));
    expect([...retiredIds(s.byId)]).toEqual(["b"]);
    expect(retiredIds(undefined).size).toBe(0);
  });
});
