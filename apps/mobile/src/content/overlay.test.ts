import { describe, expect, it } from "vitest";
import type { Question, QuestionPatch, TopicMap } from "@p6/shared";
import { allLv1From, levelIdsFrom, levelQuestionsFrom, poolFrom, questionFrom, unlockQuestionFrom, type Source } from "./overlay";

const q = (id: string, difficulty: Question["difficulty"] = "LV1", over: Partial<Question> = {}): Question =>
  ({ id, difficulty, type: "mcq", autoMarkable: true, stem: [], ...over } as unknown as Question);
const ids = ["a", "b", "c", "d", "e"];
const topic: TopicMap = {
  id: "t", name: "T", order: 1, unlockPool: ["k1", "k2"],
  subtopics: [{ id: "s", name: "S", order: 1, main: { 1: ids, 2: ["m1"], 3: ["m2"] }, pool: ["p1", "p2", "p3"] }],
} as never;
const questions: Record<string, Question> = Object.fromEntries(
  [...ids, "k1", "k2", "p1", "p3"].map((i) => [i, q(i)]).concat([["m1", q("m1", "LV2")], ["m2", q("m2", "LV3")], ["p2", q("p2", "LV2")]]),
);
const retire = (id: string): QuestionPatch => ({ id, question: null, editedAt: "1" });
const src = (patches: Record<string, QuestionPatch> = {}): Source => ({ questions, topics: [topic], patches });
const sub = topic.subtopics[0];

describe("question overlay", () => {
  it("returns the patched question, else the bundled one", () => {
    const patched = q("a", "LV1", { autoMarkable: false });
    expect(questionFrom(src(), "a")).toBe(questions.a);
    expect(questionFrom(src({ a: { id: "a", question: patched, editedAt: "1" } }), "a")).toBe(patched);
    expect(questionFrom(src(), "zzz")).toBeUndefined();
  });
  it("hides retired questions everywhere", () => {
    const s = src({ b: retire("b"), p1: retire("p1"), k1: retire("k1") });
    expect(questionFrom(s, "b")).toBeUndefined();
    expect(levelQuestionsFrom(s, sub, 1).map((x) => x.id)).toEqual(["a", "c", "d", "e"]);
    expect(poolFrom(s).map((x) => x.id)).toEqual(["p2", "p3"]);
    expect(poolFrom(s, { level: 2 }).map((x) => x.id)).toEqual(["p2"]);
    expect(allLv1From(s).map((x) => x.id).sort()).toEqual(["a", "c", "d", "e", "p3"]);
    expect(unlockQuestionFrom(s, topic, () => 0)?.id).toBe("k2");
    expect(unlockQuestionFrom(src({ k1: retire("k1"), k2: retire("k2") }), topic)).toBeUndefined();
  });
  it("uses a patched question's new fields for filtering (difficulty / autoMarkable)", () => {
    const s = src({ p1: { id: "p1", question: q("p1", "LV3"), editedAt: "1" }, p3: { id: "p3", question: q("p3", "LV1", { autoMarkable: false }), editedAt: "1" } });
    expect(poolFrom(s, { level: 3 }).map((x) => x.id)).toEqual(["p1"]);
    expect(poolFrom(s, { autoMarkableOnly: true }).map((x) => x.id)).toEqual(["p1", "p2"]);
    expect(allLv1From(s).map((x) => x.id)).not.toContain("p3");
  });
  it("level ids drop retired slots (activeLevelIds), keep the slot count, and never go empty", () => {
    expect(levelIdsFrom(src({ c: retire("c") }), ids)).toEqual({ ids: ["a", "b", "d", "e"], total: 5 });
    const all = Object.fromEntries(ids.map((i) => [i, retire(i)]));
    expect(levelIdsFrom(src(all), ids)).toEqual({ ids, total: 5 });
    // a level whose every question was retired still plays (bundled questions)
    expect(levelQuestionsFrom(src(all), sub, 1).map((x) => x.id)).toEqual(ids);
  });
});
