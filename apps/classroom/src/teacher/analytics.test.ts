import { describe, expect, it } from "vitest";
import type { TopicMap } from "@p6/shared";
import { classAnalytics, mapQuestions, studentAnalytics } from "./analytics";

const topics: TopicMap[] = [
  { id: "frac", name: "Fractions", order: 1, unlockPool: [], subtopics: [{ id: "f1", name: "F1", order: 1, pool: [], main: { 1: ["a", "b"], 2: ["c"], 3: [] } }] },
  { id: "geo", name: "Geometry", order: 2, unlockPool: [], subtopics: [{ id: "g1", name: "G1", order: 1, pool: [], main: { 1: ["d"], 2: [], 3: [] } }] },
];
const typeOf = (id: string) => (id === "a" ? "mcq" : "open");
const qs = mapQuestions(topics, typeOf);
const stat = (a: number, c: boolean) => ({ a, c, w: c ? a - 1 : a, t: 1 });

describe("analytics", () => {
  it("lists map questions once, with topic and type", () => {
    expect(qs.map((q) => `${q.id}:${q.topicId}:${q.level}:${q.type}`)).toEqual(["a:frac:1:mcq", "b:frac:1:open", "c:frac:2:open", "d:geo:1:open"]);
  });
  it("computes a student's progress", () => {
    const s = studentAnalytics("u1", "Zach", "P6", topics, qs, { a: stat(1, true), b: stat(3, false) });
    expect(s.topics[0]).toMatchObject({ total: 3, completed: 1, attempted: 2, byType: { mcq: { total: 1, completed: 1 }, open: { total: 2, completed: 0 } } });
    expect(s.topics[1]).toMatchObject({ total: 1, completed: 0, attempted: 0 });
    expect(s.questions.map((r) => r.questionId)).toEqual(["a", "b"]);
  });
  it("aggregates the class", () => {
    const stats: Record<string, Record<string, ReturnType<typeof stat>>> = { u1: { a: stat(1, true), b: stat(4, false) }, u2: { b: stat(2, true) } };
    const c = classAnalytics("c1", [{ uid: "u1", displayName: "Z" }, { uid: "u2", displayName: "M" }], (u) => stats[u] ?? {}, topics, qs);
    expect(c.topics[0]).toMatchObject({ students: 2, total: 3, completed: 2, attempted: 3 });
    const b = c.questions.find((r) => r.questionId === "b")!;
    expect(b).toMatchObject({ studentsAttempted: 2, studentsCompleted: 1, totalAttempts: 6, avgAttempts: 3 });
    expect(c.students).toEqual([{ uid: "u1", displayName: "Z", completed: 1, attempted: 2 }, { uid: "u2", displayName: "M", completed: 1, attempted: 1 }]);
    expect(classAnalytics("c1", [], () => ({}), topics, qs, "geo").topics.map((t) => t.topicId)).toEqual(["geo"]);
  });
});
