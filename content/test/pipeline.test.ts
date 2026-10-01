import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkAnswer, markQuestion, type Curriculum, type QuestionBundle } from "@p6/shared";
import { runAuditOn } from "../src/audit";
import { prepare } from "../src/build";
import { writeOutputs } from "../src/output";
import { buildCurriculum } from "../src/select";
import { detectSubtopicField, parseCsv, type RawDoc } from "../src/source";
import { runMock } from "../src/mock";
import { fromFsFields, loadCredentials, CredentialsError } from "../src/sync";
import { sanitizeId } from "../src/paths";

function doc(i: number, o: Partial<RawDoc> = {}): RawDoc {
  const lv = i % 3 === 0 ? "LV1" : i % 3 === 1 ? "LV2" : "LV3";
  return {
    id: `${2015 + (i % 9)}_School${i % 4}_P2_Q${i}`, year: 2015 + (i % 9), topic_primary: "Fractions", difficulty: lv,
    question_type: lv === "LV1" ? "mcq" : "short", paper: lv === "LV1" ? "Paper 1 Booklet A" : "Paper 2", verified: i % 2 === 0,
    question: "Find $\\frac{1}{2} + \\frac{1}{4}$.", subtopic: i % 2 ? "Adding fractions" : "Dividing fractions",
    ...(lv === "LV1" ? { options: { "1": "$\\frac{3}{4}$", "2": "$\\frac{2}{6}$", "3": "1", "4": "2" }, answer_key: "1" } : { answer: "$\\frac{3}{4}$" }),
    ...o,
  };
}

describe("subtopic detection", () => {
  it("prefers `subtopic`", () => expect(detectSubtopicField([doc(0), doc(1)]).field).toBe("subtopic"));
  it("falls back to array field", () => {
    const d = [{ id: "a", subtopics: ["X"] }, { id: "b", subtopics: ["Y"] }] as RawDoc[];
    expect(detectSubtopicField(d).field).toBe("subtopics");
  });
  it("finds unknown *subtopic* keys", () => {
    expect(detectSubtopicField([{ id: "a", my_subtopic_x: "A" }] as RawDoc[]).field).toBe("my_subtopic_x");
  });
  it("none", () => expect(detectSubtopicField([{ id: "a" }] as RawDoc[]).field).toBeNull());
});

describe("prepare/audit/build on synthetic docs", () => {
  const docs = [
    ...Array.from({ length: 60 }, (_, i) => doc(i)),
    doc(100, { has_error: true }),
    doc(101, { topic_primary: "Weird Topic" }),
    doc(102, { topic_primary: "Drawing", difficulty: "LV2", question_type: "short", answer: "see figure" }),
    doc(103, { figure_url: "https://example.com/x.png" }),
  ];
  const prep = prepare(docs, "P6", { figDir: "/nonexistent" });
  it("skips non-canonical topics", () => expect(prep.skipped.map((s) => s.id)).toContain(docs[61].id));
  it("reports missing figures", () => expect(prep.missingFigures).toEqual([docs[63].id]));
  it("drawing is not auto-markable", () => expect(prep.candidates.find((c) => c.q.id === docs[62].id)!.q.autoMarkable).toBe(false));
  it("mcq converted", () => {
    const q = prep.candidates[0].q;
    expect(q.type).toBe("mcq");
    expect(q.correctOption).toBe("1");
    expect(markQuestion(q, ["1"]).correct).toBe(true);
  });
  it("open converted & markable", () => {
    const q = prep.candidates[1].q;
    expect(markQuestion(q, ["3/4"]).correct).toBe(true);
    expect(markQuestion(q, ["0.75"]).correct).toBe(true);
  });
  it("audit report content", () => {
    const r = runAuditOn(docs, "P6", { figDir: "/nonexistent" });
    expect(r.markdown).toContain("Detected field: **subtopic**");
    expect(r.markdown).toContain("expected 62 subtopics but found 3"); // loud mismatch
    expect(r.markdown).toContain("has_error: **1**");
    expect(r.markdown).toContain("Weird Topic");
    expect(r.ok).toBe(false);
  });
  it("mapping override wins", () => {
    const mapping = new Map([[docs[0].id, { topic: "Algebra", subtopic: "Override" }]]);
    const p = prepare(docs, "P6", { mapping, figDir: "/nonexistent" });
    expect(p.candidates.find((c) => c.q.id === docs[0].id)!.q.topic).toBe("Algebra");
  });
  it("writes outputs", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p6c-"));
    const kept = prep.candidates.filter((c) => !c.hasError);
    const cur = buildCurriculum({ grade: "P6", version: "", subtopics: prep.defs, candidates: kept });
    const res = await writeOutputs({ grade: "P6", questions: kept.map((c) => c.q), curriculum: { grade: "P6", topics: cur.topics }, figures: [], contentRoot: dir });
    const bundle: QuestionBundle = JSON.parse(fs.readFileSync(path.join(dir, "P6", "questions.json"), "utf8"));
    const curriculum: Curriculum = JSON.parse(fs.readFileSync(path.join(dir, "P6", "curriculum.json"), "utf8"));
    expect(bundle.version).toBe(res.version);
    expect(curriculum.version).toBe(res.version);
    expect(fs.readFileSync(path.join(dir, "index.ts"), "utf8")).toContain("contentFor");
    // same input → same version
    const res2 = await writeOutputs({ grade: "P6", questions: kept.map((c) => c.q), curriculum: { grade: "P6", topics: cur.topics }, figures: [], contentRoot: dir });
    expect(res2.version).toBe(res.version);
  });
});

describe("mock bundle", () => {
  it("is valid, 62 subtopics, 5/5/5 everywhere, specs accept their own answers", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "p6m-"));
    const res = await runMock("P6", { contentRoot: dir });
    expect(res.version.startsWith("mock-")).toBe(true);
    const bundle: QuestionBundle = JSON.parse(fs.readFileSync(path.join(dir, "P6", "questions.json"), "utf8"));
    const cur: Curriculum = JSON.parse(fs.readFileSync(path.join(dir, "P6", "curriculum.json"), "utf8"));
    expect(cur.topics).toHaveLength(13);
    let subs = 0;
    for (const t of cur.topics) {
      expect(t.subtopics.length).toBeGreaterThanOrEqual(4);
      expect(t.subtopics.length).toBeLessThanOrEqual(6);
      for (const s of t.subtopics) {
        subs++;
        for (const lv of [1, 2, 3] as const) {
          expect(s.main[lv]).toHaveLength(5);
          for (const id of s.main[lv]) {
            const q = bundle.questions[id];
            expect(q.difficulty).toBe(`LV${lv}`);
            expect(q.autoMarkable).toBe(true);
          }
        }
        expect(s.main[1].length + s.main[2].length + s.main[3].length + s.pool.length).toBeGreaterThanOrEqual(25);
      }
    }
    expect(subs).toBe(62);
    for (const q of Object.values(bundle.questions)) {
      if (!q.autoMarkable) continue;
      if (q.type === "mcq") expect(q.options!.some((o) => o.key === q.correctOption)).toBe(true);
      else for (const p of q.parts!) expect(checkAnswer(p.answer, p.display), `${q.id} ${p.display}`).toBe(true);
      if (q.figure) expect(fs.existsSync(path.join(dir, "P6", "figures", `${sanitizeId(q.figure)}.webp`))).toBe(true);
    }
    expect(fs.readFileSync(path.join(dir, "P6", "figures", "index.ts"), "utf8")).toContain("require(");
  }, 60000);
});

describe("sync helpers", () => {
  it("converts typed REST values", () => {
    expect(fromFsFields({
      a: { stringValue: "x" }, b: { integerValue: "5" }, c: { doubleValue: 1.5 }, d: { booleanValue: true }, e: { nullValue: null },
      f: { arrayValue: { values: [{ stringValue: "1" }] } }, g: { mapValue: { fields: { z: { integerValue: "1" } } } },
      h: { timestampValue: "2024-01-01T00:00:00Z" }, i: { arrayValue: {} },
    })).toEqual({ a: "x", b: 5, c: 1.5, d: true, e: null, f: ["1"], g: { z: 1 }, h: "2024-01-01T00:00:00Z", i: [] });
  });
  it("fails clearly without credentials", () => {
    expect(() => loadCredentials({})).toThrow(CredentialsError);
    expect(() => loadCredentials({})).toThrow(/FIREBASE_SERVICE_ACCOUNT_JSON/);
    expect(() => loadCredentials({ FIREBASE_SERVICE_ACCOUNT_JSON: "{" })).toThrow(/not valid JSON/);
  });
  it("parses csv", () => expect(parseCsv('question_id,topic,subtopic\na,"B, C",d\n')).toEqual([["question_id", "topic", "subtopic"], ["a", "B, C", "d"]]));
  it("sanitizes ids", () => expect(sanitizeId("2024/Nan yang:Q1")).toBe("2024_Nan_yang_Q1"));
});
