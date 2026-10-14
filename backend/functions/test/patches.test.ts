import { describe, expect, it, vi } from "vitest";
import { activeLevelIds, levelAttemptStars } from "../src/shared/index.js";
import type { ServerContent } from "../src/content/index.js";
import { buildPatch, figHash, isRetired, patchFloor, patchPage, toServerQuestion, validatePatchRequest } from "../src/logic/patches.js";
import { PatchCache, REFRESH_MS } from "../src/logic/patchCache.js";
import { isCorrect } from "../src/logic/marking.js";
import { PER_MINUTE } from "../src/logic/rateLimit.js";
import { CONTENT } from "../src/content/index.js";

const OLD = "https://res.cloudinary.com/x/image/upload/v1/old.png";
const content: ServerContent = {
  version: "v1", builtAt: "2026-10-14T02:08:49.555Z", snapshotAt: "2026-10-14T02:07:46.934Z",
  levels: { "p6-a#1": ["Q1", "Q2", "Q3"] },
  answers: { Q1: { t: "mcq", o: "2" }, Q2: { t: "mcq", o: "1" }, Q3: { t: "open", p: [{ kind: "number", value: 4 }] } },
  topics: [], subtopics: ["p6-a"],
  questions: {
    Q1: { s: 0, c: "Arithmetic", d: 1, p: 1 },
    Q2: { s: 0, c: "Arithmetic", d: 1, p: 1, f: 1, u: figHash(OLD) },
    Q3: { s: 0, c: "Arithmetic", d: 1, p: 1, f: 1 }, // figure of unknown source
    POOL: { s: 0, c: "Arithmetic", d: 2 }, // never an editor pick
  },
};
const mcqDoc = (id: string, o: Record<string, unknown> = {}) => ({
  id, question: "What is 1 + 1?", question_type: "mcq", difficulty: "LV1", options: { "1": "1", "2": "2", "3": "3", "4": "4" }, answer_key: 2,
  selected: true, excluded: false, figure_url: null, ...o,
});
const AT = "2026-10-15T01:00:00.000Z";

describe("validatePatchRequest", () => {
  const ok = (r: unknown) => validatePatchRequest(r).ok;
  it("accepts", () => {
    expect(ok({ grade: "P6", bundleVersion: "v1", since: "" })).toBe(true);
    expect(ok({ grade: "P6", bundleVersion: "other", since: AT })).toBe(true);
  });
  it("rejects bad input", () => {
    expect(ok(null)).toBe(false);
    expect(ok({ grade: "P5", bundleVersion: "v1", since: "" })).toBe(false); // not active
    expect(ok({ grade: "P6", bundleVersion: 1, since: "" })).toBe(false);
    expect(ok({ grade: "P6", bundleVersion: "v1" })).toBe(false);
    expect(ok({ grade: "P6", bundleVersion: "v1", since: "yesterday" })).toBe(false);
    expect(ok({ grade: "P6", bundleVersion: "v1", since: "2026-13-45T00:00:00Z" })).toBe(false);
  });
  it("is rate limited", () => expect(PER_MINUTE.getQuestionPatches).toBe(20));
});

describe("patchFloor", () => {
  it("never goes before the bundle's snapshot", () => {
    expect(patchFloor(content, "")).toBe(content.snapshotAt);
    expect(patchFloor(content, "2026-01-01T00:00:00.000Z")).toBe(content.snapshotAt);
    expect(patchFloor(content, AT)).toBe(AT);
  });
  it("falls back to builtAt", () => expect(patchFloor({ ...content, snapshotAt: "" }, "")).toBe(content.builtAt));
});

describe("buildPatch", () => {
  it("retires excluded questions", () => expect(buildPatch("P6", content, mcqDoc("Q1", { excluded: true }), AT)).toEqual({ id: "Q1", question: null, editedAt: AT }));
  it("retires a pick that was deselected", () => expect(buildPatch("P6", content, mcqDoc("Q1", { selected: false }), AT)?.question).toBeNull());
  it("does not retire pool questions for selected:false", () => {
    const p = buildPatch("P6", content, mcqDoc("POOL", { selected: false }), AT)!;
    expect(p.question).not.toBeNull();
    expect(isRetired(mcqDoc("POOL", { selected: false }), content.questions.POOL)).toBe(false);
  });
  it("builds the edited question with the bundle's subtopic, topic and difficulty", () => {
    const p = buildPatch("P6", content, mcqDoc("Q1", { answer_key: 4, difficulty: "LV3", topic_primary: "Ratio" }), AT)!;
    expect(p.question).toMatchObject({ id: "Q1", correctOption: "4", subtopicId: "p6-a", topic: "Arithmetic", difficulty: "LV1", grade: "P6" });
    expect(p.editedAt).toBe(AT);
    expect("figureUrl" in p).toBe(false);
    expect(p.question!.figure).toBeUndefined();
  });
  it("ignores ids that are not in the bundle", () => expect(buildPatch("P6", content, mcqDoc("NEW"), AT)).toBeNull());
  it("sends figureUrl only when the editor's figure differs from the bundled one", () => {
    const same = buildPatch("P6", content, mcqDoc("Q2", { figure_url: OLD }), AT)!;
    expect("figureUrl" in same).toBe(false);
    expect(same.question!.figure).toBe("Q2");
    const NEW = "https://res.cloudinary.com/x/image/upload/v2/new.png";
    const changed = buildPatch("P6", content, mcqDoc("Q2", { figure_url: NEW }), AT)!;
    expect(changed.figureUrl).toBe(NEW);
    expect(changed.question!.figure).toBe("Q2");
  });
  it("a new figure on a question without one counts as changed; an unknown source does not", () => {
    const NEW = "https://res.cloudinary.com/x/image/upload/v2/new.png";
    expect(buildPatch("P6", content, mcqDoc("Q1", { figure_url: NEW }), AT)!.figureUrl).toBe(NEW);
    const unknown = buildPatch("P6", content, mcqDoc("Q3", { figure_url: NEW }), AT)!;
    expect("figureUrl" in unknown).toBe(false);
    expect(unknown.question!.figure).toBe("Q3");
  });
  it("a figure the editor removed is dropped from the question", () => {
    const p = buildPatch("P6", content, mcqDoc("Q2", { figure_url: null }), AT)!;
    expect(p.question!.figure).toBeUndefined();
    expect("figureUrl" in p).toBe(false);
  });
});

describe("patchPage", () => {
  const docs = [
    { doc: mcqDoc("Q1", { answer_key: 4 }), editedAt: "2026-10-15T01:00:00.000Z" },
    { doc: mcqDoc("NEW"), editedAt: "2026-10-15T02:00:00.000Z" },
    { doc: mcqDoc("Q2", { excluded: true }), editedAt: "2026-10-15T03:00:00.000Z" },
  ];
  it("keeps bundle ids, until = last doc read (also out-of-bundle), more when the limit was hit", () => {
    const p = patchPage("P6", content, docs, "", 300);
    expect(p.patches.map((x) => x.id)).toEqual(["Q1", "Q2"]);
    expect(p.until).toBe("2026-10-15T03:00:00.000Z");
    expect(p.more).toBe(false);
    expect(patchPage("P6", content, docs, "", 3).more).toBe(true);
  });
  it("no docs: until = since", () => expect(patchPage("P6", content, [], AT)).toEqual({ patches: [], until: AT, more: false }));
});

describe("marking with an edited answer", () => {
  const edited = new Map([["Q1", toServerQuestion(buildPatch("P6", content, mcqDoc("Q1", { answer_key: 4 }), AT)!.question!)]]);
  it("the bundle's answer is replaced", () => {
    expect(isCorrect(content, "Q1", ["2"])).toBe(true);
    expect(isCorrect(content, "Q1", ["2"], edited)).toBe(false);
    expect(isCorrect(content, "Q1", ["4"], edited)).toBe(true);
    expect(isCorrect(content, "Q2", ["1"], edited)).toBe(true); // not edited: bundle
  });
  it("an edit that can't be auto-marked marks wrong", () => {
    const q = buildPatch("P6", content, mcqDoc("Q1", { answer_key: null }), AT)!.question!;
    expect(toServerQuestion(q)).toBeNull();
    expect(isCorrect(content, "Q1", ["2"], new Map([["Q1", null]]))).toBe(false);
  });
  it("open answers too", () => {
    const q = buildPatch("P6", content, { id: "Q3", question: "x", question_type: "short", difficulty: "LV1", answer: "5", selected: true }, AT)!.question!;
    expect(isCorrect(content, "Q3", ["5"], new Map([["Q3", toServerQuestion(q)]]))).toBe(true);
    expect(isCorrect(content, "Q3", ["4"], new Map([["Q3", toServerQuestion(q)]]))).toBe(false);
  });
});

describe("retired questions in the star path", () => {
  const ids = content.levels["p6-a#1"];
  it("a level without its retired question completes with the others", () => {
    const active = activeLevelIds(ids, ["Q3"]);
    expect(active).toEqual(["Q1", "Q2"]);
    const r = levelAttemptStars(active, [], ["Q1", "Q2"], false);
    expect(r).toMatchObject({ stars: 2, complete: true });
    // without activeLevelIds the level would still need Q3
    expect(levelAttemptStars(ids, [], ["Q1", "Q2"], false).complete).toBe(false);
  });
  it("replay bonus needs only the active questions", () => expect(levelAttemptStars(["Q1", "Q2"], ["Q1", "Q2"], ["Q1", "Q2"], false).bonus).toBe(true));
  it("never empties a level", () => expect(activeLevelIds(ids, ids)).toEqual(ids));
});

describe("PatchCache", () => {
  const page = (id: string, at: string, more = false) => ({ patches: [{ id, question: toServerQuestionSource(id), editedAt: at }], until: at, more });
  function toServerQuestionSource(id: string) {
    return buildPatch("P6", content, mcqDoc(id, { answer_key: 4 }), AT)!.question;
  }
  it("loads the first time, then only after the interval, with one refresh in flight", async () => {
    let t = 1000;
    const fetchPage = vi.fn(async (since: string) => (since === "" ? page("Q1", "2026-10-15T01:00:00.000Z") : { patches: [], until: since, more: false }));
    const c = new PatchCache(content, fetchPage, () => t);
    const [a, b] = await Promise.all([c.get(), c.get()]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(a.answers.get("Q1")).toEqual({ t: "mcq", o: "4" });
    t += REFRESH_MS - 1;
    await c.get();
    expect(fetchPage).toHaveBeenCalledTimes(1);
    t += 1;
    await c.get();
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls[1][0]).toBe("2026-10-15T01:00:00.000Z"); // incremental
  });
  it("follows `more` and tracks retired questions", async () => {
    const pages = [
      page("Q1", "2026-10-15T01:00:00.000Z", true),
      { patches: [{ id: "Q2", question: null, editedAt: "2026-10-15T02:00:00.000Z" }], until: "2026-10-15T02:00:00.000Z", more: false },
    ];
    const c = new PatchCache(content, async () => pages.shift()!, () => 1);
    const v = await c.get();
    expect([...v.retired]).toEqual(["Q2"]);
    expect(v.answers.has("Q1")).toBe(true);
  });
  it("a failing refresh keeps the bundle's answers and never throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const c = new PatchCache(content, async () => { throw new Error("down"); }, () => 1);
    const v = await c.get();
    expect(v.answers.size).toBe(0);
    expect(v.retired.size).toBe(0);
  });
  it("a refresh that fails later keeps the earlier view", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let t = 1, fail = false;
    const c = new PatchCache(content, async () => { if (fail) throw new Error("down"); return page("Q1", "2026-10-15T01:00:00.000Z"); }, () => t);
    await c.get();
    fail = true; t += REFRESH_MS;
    expect((await c.get()).answers.has("Q1")).toBe(true);
  });
});

describe("generated content for patches", () => {
  const P6 = CONTENT.P6!;
  it("knows every bundled question and its subtopic", () => {
    expect(P6.builtAt).toMatch(/^\d{4}-/);
    expect(P6.snapshotAt <= P6.builtAt).toBe(true);
    const ids = Object.keys(P6.questions);
    expect(ids.length).toBeGreaterThan(3000);
    for (const id of Object.values(P6.levels).flat()) expect(P6.questions[id], id).toBeDefined();
    expect(P6.subtopics[P6.questions["2021_ACS_P1A_Q01"].s]).toMatch(/^p6-/);
    expect(P6.questions["2021_ACS_P1A_Q03"].f).toBe(1);
  });
  it("figHash is stable", () => expect(figHash("https://a/b.png")).toBe(figHash("https://a/b.png")));
});
