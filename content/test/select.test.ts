import { describe, expect, it } from "vitest";
import type { Difficulty, Question } from "@p6/shared";
import { buildCurriculum, buildUnlockPool, pickLevel, subtopicId, type SelCandidate, type SelectionNote } from "../src/select";

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

import { allowedInSubtopic, showsPreferredIntent, violatedFeatures } from "../src/subtopicRules";

describe("subtopic rules (fractions add/subtract: no algebra, no multiplication/division)", () => {
  const ID = "p6-fractions-addition-and-subtraction-of-fractions-and-mixed-numbers";
  const mk = (stem: string, o: Partial<Parameters<typeof cand>[0]> = {}) => cand({ sub: ID, stem, ...o });
  const bad = (stem: string) => violatedFeatures(mk(stem).q);
  it("flags algebra", () => {
    expect(bad("Mina has ＄p. She has half as much money as Siti.")).toContain("algebra");
    expect(bad("Simplify 3k + 2k")).toContain("algebra");
    expect(bad("Find the value of 2p/2 when p = 6")).toContain("algebra");
    expect(bad("Simplify 5m-9-m+2m+12")).toContain("algebra");
  });
  it("flags multiplication and division, including fraction-of", () => {
    for (const s of ["Find 1/2 × 1/7", "Calculate 6 ÷ 3", "Divide 2 by 8/5", "3 times as many", "twice as old", "What is the product of 2 and 3?",
      "3/4 of the class are girls", "He spent 2/5 of his money", "25% of the pupils", "half of the cake", "How many sixths are there in 2 2/3?"]) {
      expect(bad(s), s).toContain("multiplicationDivision");
    }
  });
  it("does not flag plain fraction add/subtract, units, times of day, or 'Which of the following'", () => {
    for (const s of ["Find the value of 3/4 - 2/5.", "Which of the following fractions is greater than 1/3?", "What fraction of the figure is shaded?",
      "Gerald had 4/5 l of milk. He drank 1/4 l.", "There was 3/8 l of water. She used 250g and 5 kg", "She left at 5.50 a.m. and travelled for 1 1/4 h", "Express 5 4/11 as a decimal."]) {
      expect(bad(s), s).toEqual([]);
    }
  });
  it("looks at options and answers too", () => {
    const withOpt = cand({ sub: ID, stem: "Which one is equal to 2/7?" });
    withOpt.q.options = [{ key: "1", text: [{ t: "text", v: "1/2 × 1/7" }] }];
    expect(allowedInSubtopic(withOpt.q)).toBe(false);
    const withAns = cand({ sub: ID, stem: "Simplify.", type: "open" });
    withAns.q.parts = [{ part: "", answer: { kind: "text", accepted: ["5y+2"] }, display: "5y+2" }];
    expect(allowedInSubtopic(withAns.q)).toBe(false);
  });
  it("other subtopics are untouched", () => {
    expect(allowedInSubtopic(cand({ sub: "p6-fractions-a", stem: "3/4 of 12 × 2 and p + 3" }).q)).toBe(true);
  });
  it("main levels and pools skip failing questions; short levels are filled from the nearest difficulty and reported", () => {
    const cs: SelCandidate[] = [];
    for (let i = 0; i < 6; i++) cs.push(cand({ id: `L1-${i}`, sub: ID, diff: "LV1", stem: "Add 1/2 + 1/3", year: 2015 + i, school: `s${i}` }));
    for (let i = 0; i < 8; i++) cs.push(cand({ id: `L2-${i}`, sub: ID, diff: "LV2", stem: "Subtract 3/4 - 1/3", year: 2015 + i, school: `t${i}` }));
    cs.push(cand({ id: "L3-ok", sub: ID, diff: "LV3", stem: "Add 1/2 + 1/3", type: "open" }));
    for (let i = 0; i < 6; i++) cs.push(cand({ id: `L3-bad${i}`, sub: ID, diff: "LV3", stem: i % 2 ? "3/4 of the class" : "Find 2k + 3", type: "open" }));
    cs.push(cand({ id: "L1-bad", sub: ID, diff: "LV1", stem: "2 × 3" }));
    const notes: SelectionNote[] = [];
    const cur = buildCurriculum({ grade: "P6", version: "v", subtopics: [{ id: ID, topic: "Fractions", name: "A" }], candidates: cs, notes });
    const node = cur.topics[0].subtopics[0];
    const all = [...node.main[1], ...node.main[2], ...node.main[3], ...node.pool, ...cur.topics[0].unlockPool];
    expect(all.some((id) => id.includes("bad"))).toBe(false);
    for (const lv of [1, 2, 3] as const) expect(node.main[lv]).toHaveLength(5);
    expect(node.shortfall).toBeUndefined();
    expect(node.main[3]).toContain("L3-ok");
    expect(notes.filter((n) => n.level === 3)).toHaveLength(4);
    expect(notes.filter((n) => n.fromDifficulty === "LV2")).toHaveLength(3); // nearest first, then the next closest
    expect(notes.filter((n) => n.fromDifficulty === "LV1")).toHaveLength(1);
  });
  it("reports a shortfall when even the nearest difficulties run out", () => {
    const cs = [cand({ id: "only", sub: ID, diff: "LV1", stem: "Add 1/2 + 1/3" })];
    const node = buildCurriculum({ grade: "P6", version: "v", subtopics: [{ id: ID, topic: "Fractions", name: "A" }], candidates: cs }).topics[0].subtopics[0];
    expect(node.shortfall).toEqual({ 1: 4, 2: 5, 3: 5 });
  });
});

describe("subtopic preference: questions that add or subtract come first", () => {
  const ID = "p6-fractions-addition-and-subtraction-of-fractions-and-mixed-numbers";
  const sub = [{ id: ID, topic: "Fractions", name: "A" }];
  const intent = (stem: string) => showsPreferredIntent(cand({ sub: ID, stem }).q);
  it("detects add/subtract intent and not the other fraction topics", () => {
    for (const s of ["3 + 3/100 + 30/1000 =", "Find the value of 3/4-2/5.", "Find the difference between 9/10 kg and 1/5 kg", "How much milk was left? He drank 1/4 l of 4/5 l",
      "The total mass is 9/10 kg and the apple is 1/5 kg", "1/5 were red, 3/5 were blue and the rest were green."]) expect(intent(s), s).toBe(true);
    for (const s of ["What fraction of the figure is shaded?", "Which fraction is greater than 1/3?", "Express 5 4/11 as a decimal.", "In the number line, what is the value represented by A?",
      "Arrange 3/2, 1 5/9, 6/5 from the smallest.", "Shawn left his home at 5.50 a.m. and travelled for 1 1/4 h", "After baking 60 big cupcakes, what is the remaining number?"]) expect(intent(s), s).toBe(false);
  });
  it("uses add/subtract questions first, at every level, before other fraction questions", () => {
    const cs: SelCandidate[] = [];
    for (const d of ["LV1", "LV2", "LV3"] as Difficulty[]) {
      for (let i = 0; i < 4; i++) cs.push(cand({ id: `${d}-other${i}`, sub: ID, diff: d, stem: "Which fraction is greater than 1/3?", year: 2015 + i, school: `o${i}` }));
      for (let i = 0; i < 5; i++) cs.push(cand({ id: `${d}-add${i}`, sub: ID, diff: d, stem: "Find 1/2 + 1/3", year: 2015 + i, school: `a${i}`, verified: i % 2 === 0 }));
    }
    const node = buildCurriculum({ grade: "P6", version: "v", subtopics: sub, candidates: cs }).topics[0].subtopics[0];
    for (const lv of [1, 2, 3] as const) expect(node.main[lv].every((id) => id.includes("add"))).toBe(true);
  });
  it("other questions only fill the gap, nearest-difficulty add/subtract questions come before them", () => {
    const cs = [
      cand({ id: "L1-add", sub: ID, diff: "LV1", stem: "Find 1/2 + 1/3" }),
      ...Array.from({ length: 6 }, (_, i) => cand({ id: `L1-o${i}`, sub: ID, diff: "LV1", stem: "Which fraction is greater than 1/3?", year: 2015 + i, school: `x${i}` })),
      ...Array.from({ length: 7 }, (_, i) => cand({ id: `L2-add${i}`, sub: ID, diff: "LV2", stem: "Find 3/4 - 1/3", year: 2015 + i, school: `y${i}` })),
      cand({ id: "L3-o", sub: ID, diff: "LV3", stem: "Convert 2 3/8 to an improper fraction" }),
    ];
    const notes: SelectionNote[] = [];
    const node = buildCurriculum({ grade: "P6", version: "v", subtopics: sub, candidates: cs, notes }).topics[0].subtopics[0];
    expect(node.main[2].every((id) => id.startsWith("L2-add"))).toBe(true);
    expect(node.main[3].filter((id) => id.startsWith("L2-add"))).toHaveLength(2); // leftover add/subtract before the LV3 "other"
    expect(node.main[3]).toContain("L3-o");
    expect(node.main[1]).toContain("L1-add");
    expect(notes.some((n) => n.level === 3 && n.fromDifficulty === "LV2")).toBe(true);
  });
});
