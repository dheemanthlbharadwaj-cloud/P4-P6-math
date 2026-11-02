import { describe, expect, it } from "vitest";
import { bySession, childSummary, fromDayInput, toDayInput } from "./format";

describe("format", () => {
  it("day input round trip; bad dates refused", () => {
    const t = fromDayInput("2026-11-01")!;
    expect(toDayInput(t)).toBe("2026-11-01");
    expect(fromDayInput("2026-02-30")).toBeNull();
    expect(fromDayInput("1/11/2026")).toBeNull();
  });
  it("child summary counts faces over every goal", () => {
    expect(childSummary([{ lessonId: "a", goals: { g1: "good", g2: "ok" } }, { lessonId: "a", goals: { g1: "bad" } }]))
      .toEqual({ lessons: 2, distinctLessons: 1, faces: { good: 1, ok: 1, bad: 1 } });
  });
  it("groups reports by session, newest first", () => {
    const g = bySession([{ sessionId: "s1", date: 1 }, { sessionId: "s2", date: 5 }, { sessionId: "s1", date: 1 }]);
    expect(g.map((x) => [x.sessionId, x.rows.length])).toEqual([["s2", 1], ["s1", 2]]);
  });
});
