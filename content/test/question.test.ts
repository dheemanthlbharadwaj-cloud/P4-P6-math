import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { prepare } from "../src/build";
import { sha256 } from "../src/output";
import { docToQuestion } from "../src/question";
import { loadMapping, loadSnapshot, type RawDoc } from "../src/source";
import { snapshotPath } from "../src/paths";
import { assetsContentRoot } from "../src/paths";
import path from "node:path";

const mcq: RawDoc = {
  id: "2026_ACS_Junior_P1A_Q08", year: 2026, topic_primary: "Arithmetic", subtopic: "Order of Operations", difficulty: "LV1", question_type: "mcq",
  paper: "Paper 1 Booklet A", question: "8 What is $\\frac{1}{2}$ of 10?", options: { "1": "5", "2": "6", "3": "7", "4": "38.5 cm?" }, answer_key: 1,
};
const open: RawDoc = { id: "2021_X_P2_Q05", topic_primary: "Arithmetic", subtopic: "S", difficulty: "LV2", question_type: "short", paper: "Paper 2", question: "5. Find 2 + 2.", answer: "4" };

describe("docToQuestion (pure doc → Question)", () => {
  it("is what prepare() puts in the bundle", () => {
    const docs = [mcq, open];
    const prep = prepare(docs, "P6", { figDir: "/nonexistent" });
    for (const d of docs) {
      const c = prep.candidates.find((x) => x.q.id === d.id)!;
      const sub = c.q.subtopicId;
      expect(docToQuestion(d, { grade: "P6", subtopicId: sub, topic: "Arithmetic", hasFigure: false }).question).toEqual(c.q);
    }
  });
  it("uses the context for what the bundle knows (subtopic, topic, difficulty, figure)", () => {
    const q = docToQuestion({ ...mcq, difficulty: "LV3", topic_primary: "Ratio" }, { grade: "P6", subtopicId: "p6-x-y", topic: "Arithmetic", difficulty: "LV1", hasFigure: true }).question;
    expect(q).toMatchObject({ subtopicId: "p6-x-y", topic: "Arithmetic", difficulty: "LV1", figure: mcq.id, correctOption: "1", year: 2026 });
    expect(JSON.stringify(q.options)).toContain("cm²");
  });
  it("question.ts does not import Node, sharp or fs", () => {
    const src = fs.readFileSync(path.join(__dirname, "../src/question.ts"), "utf8") + fs.readFileSync(path.join(__dirname, "../src/answerSpec.ts"), "utf8") + fs.readFileSync(path.join(__dirname, "../src/tokenizer.ts"), "utf8");
    expect(src).not.toMatch(/from "(node:|fs|path|sharp)/);
  });
});

// Determinism, not frozen content: the editor moves on, so the test never pins the bundle to an old build.
describe.skipIf(!fs.existsSync(snapshotPath("P6")))("P6 bundle build", () => {
  const questionsOf = () => {
    const snap = loadSnapshot("P6");
    const prep = prepare(snap.questions, "P6", { mapping: loadMapping("P6") });
    const questions: Record<string, unknown> = {};
    for (const q of prep.candidates.filter((c) => !c.hasError).map((c) => c.q).sort((a, b) => (a.id < b.id ? -1 : 1))) questions[q.id] = q;
    return questions;
  };
  it("building twice from the same snapshot gives identical questions and version", () => {
    const a = questionsOf(), b = questionsOf();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(sha256(JSON.stringify({ grade: "P6", questions: a }))).toBe(sha256(JSON.stringify({ grade: "P6", questions: b })));
  });
});

// The committed bundle (whatever snapshot it came from) must be self-consistent: its version is the hash of its questions.
describe.skipIf(!fs.existsSync(path.join(assetsContentRoot(), "P6", "questions.json")))("committed P6 bundle", () => {
  it("version is the hash of its questions", () => {
    const bundle = JSON.parse(fs.readFileSync(path.join(assetsContentRoot(), "P6", "questions.json"), "utf8"));
    expect(sha256(JSON.stringify({ grade: "P6", questions: bundle.questions })).slice(0, 16)).toBe(bundle.version);
  });
});
