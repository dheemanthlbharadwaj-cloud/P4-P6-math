import { describe, expect, it } from "vitest";
import type { Difficulty, Question } from "@p6/shared";
import { buildCurriculum, buildUnlockPool, pickLevel, subtopicId, type SelCandidate } from "../src/select";

let n = 0;
function cand(o: Partial<{ id: string; diff: Difficulty; verified: boolean; hasError: boolean; auto: boolean; multi: boolean; year: number; school: string; type: "mcq" | "open"; stem: string; sub: string; fig: boolean }> = {}): SelCandidate {
  const id = o.id ?? `q${String(++n).padStart(3, "0")}`;
  const q: Question = {
    id, grade: "P6", year: o.year ?? 2020, topic: "Fractions", topics: ["Fractions"], subtopicId: o.sub ?? "p6-fractions-a",
    difficulty: o.diff ?? "LV1", type: o.type ?? "mcq", paper: "Paper 1 Booklet A", calculatorAllowed: false,
    stem: [{ t: "text", v: o.stem ?? "stem" }], autoMarkable: o.auto ?? true,
    ...(o.multi ? { parts: [{ part: "a", answer: { kind: "number", value: 1 }, display: "1" }, { part: "b", answer: { kind: "number", value: 2 }, display: "2" }] } : {}),
    ...(o.fig ? { figure: id } : {}),
  };
  return { q, verified: o.verified ?? true, hasError: o.hasError ?? false, school: o.school ?? "S" };
}

describe("pickLevel", () => {
  it("excludes has_error and non-auto-markable", () => {
    const cs = [cand({ id: "a", hasError: true }), cand({ id: "b", auto: false }), cand({ id: "c" })];
    expect(pickLevel(cs, 1).map((c) => c.q.id)).toEqual(["c"]);
  });
  it("uses the matching difficulty only", () => {
    const cs = [cand({ id: "a", diff: "LV2" }), cand({ id: "b", diff: "LV1" })];
    expect(pickLevel(cs, 2).map((c) => c.q.id)).toEqual(["a"]);
  });
  it("prefers verified", () => {
    const cs = [cand({ id: "a", verified: false }), ...Array.from({ length: 5 }, (_, i) => cand({ id: `v${i}`, year: 2015 + i, school: `s${i}` }))];
    expect(pickLevel(cs, 1).map((c) => c.q.id)).not.toContain("a");
  });
  it("prefers single-part for L1/L2 but not L3 penalty", () => {
    const cs = [cand({ id: "m", diff: "LV2", multi: true }), ...Array.from({ length: 5 }, (_, i) => cand({ id: `s${i}`, diff: "LV2", year: 2015 + i, school: `s${i}` }))];
    expect(pickLevel(cs, 2).map((c) => c.q.id)).not.toContain("m");
    const l3 = [cand({ id: "a", diff: "LV3", multi: true })];
    expect(pickLevel(l3, 3)).toHaveLength(1);
  });
  it("spreads across years", () => {
    const cs = [
      ...Array.from({ length: 6 }, (_, i) => cand({ id: `a${i}`, year: 2020, school: `x${i}` })),
      ...[2017, 2018, 2019, 2021, 2022].map((y, i) => cand({ id: `z${i}`, year: y, school: `y${i}` })),
    ];
    const years = new Set(pickLevel(cs, 1).map((c) => c.q.year));
    expect(years.size).toBe(5);
  });
  it("is deterministic regardless of input order", () => {
    const cs = Array.from({ length: 20 }, (_, i) => cand({ id: `q${i}`, year: 2015 + (i % 4), school: `s${i % 3}`, verified: i % 2 === 0 }));
    const a = pickLevel(cs, 1).map((c) => c.q.id);
    const b = pickLevel([...cs].reverse(), 1).map((c) => c.q.id);
    expect(a).toEqual(b);
  });
  it("returns fewer than 5 when short", () => expect(pickLevel([cand(), cand()], 1)).toHaveLength(2));
});

describe("buildCurriculum", () => {
  const cs: SelCandidate[] = [];
  for (const d of ["LV1", "LV2", "LV3"] as Difficulty[]) for (let i = 0; i < 7; i++) cs.push(cand({ id: `${d}-${i}`, diff: d, year: 2015 + i, school: `s${i}` }));
  cs.push(cand({ id: "err", hasError: true }), cand({ id: "noauto", auto: false, diff: "LV3" }));
  const cur = buildCurriculum({ grade: "P6", version: "v", subtopics: [{ id: "p6-fractions-a", topic: "Fractions", name: "A" }], candidates: cs });
  const node = cur.topics[0].subtopics[0];
  it("5 per level, disjoint", () => {
    expect(node.main[1]).toHaveLength(5);
    expect(node.main[2]).toHaveLength(5);
    expect(node.main[3]).toHaveLength(5);
    expect(new Set([...node.main[1], ...node.main[2], ...node.main[3]]).size).toBe(15);
  });
  it("pool = rest minus has_error", () => {
    expect(node.pool).toContain("noauto");
    expect(node.pool).not.toContain("err");
    expect(node.pool).toHaveLength(21 + 1 - 15);
  });
  it("records shortfall", () => {
    const c2 = buildCurriculum({ grade: "P6", version: "v", subtopics: [{ id: "p6-fractions-a", topic: "Fractions", name: "A" }], candidates: cs.slice(0, 10) });
    expect(c2.topics[0].subtopics[0].shortfall).toEqual({ 2: 2, 3: 5 }); // 7 LV1, 3 LV2, 0 LV3
  });
  it("topics ordered canonically", () => {
    const c3 = buildCurriculum({
      grade: "P6", version: "v",
      subtopics: [{ id: "x", topic: "Rate", name: "R" }, { id: "y", topic: "Algebra", name: "A" }],
      candidates: [],
    });
    expect(c3.topics.map((t) => t.name)).toEqual(["Algebra", "Rate"]);
  });
});

describe("unlockPool", () => {
  it("up to 20 LV1 MCQ not in main, shortest first, figures last", () => {
    const cs = Array.from({ length: 30 }, (_, i) => cand({ id: `m${String(i).padStart(2, "0")}`, stem: "x".repeat(30 - i) }));
    cs.push(cand({ id: "open", type: "open" }), cand({ id: "lv2", diff: "LV2" }), cand({ id: "fig", stem: "x", fig: true }));
    const pool = buildUnlockPool(cs, new Set(["m29"]));
    expect(pool).toHaveLength(20);
    expect(pool[0]).toBe("m28");
    expect(pool).not.toContain("m29");
    expect(pool).not.toContain("open");
    expect(pool).not.toContain("lv2");
    expect(pool).not.toContain("fig");
  });
});

describe("subtopicId", () => {
  it("slugifies", () => expect(subtopicId("P6", "Area and Perimeter", "Area & Perimeter (composite)")).toBe("p6-area-and-perimeter-area-and-perimeter-composite"));
});
