import { describe, expect, it } from "vitest";
import type { ClassPost, ClassTask } from "@p6/shared";
import {
  CLASSROOM_TTL_MS, EMPTY_CLASSROOM, formatPostTime, groupTasks, homeworkIds, isNotInClass, postIcon, safeUrl, scoreCheer, scoreOf,
  scoreText, shouldRefetch, sortFeed, worksheetLabel,
} from "./classroom";

const post = (id: string, createdAt: number, kind: ClassPost["kind"] = "teacher"): ClassPost => ({ id, kind, text: id, createdAt, authorUid: "t" });
const task = (p: Partial<ClassTask>): ClassTask => ({ id: "t1", kind: "diagnostic", title: "Quick test", grade: "P6", questionIds: ["a"], createdAt: 1, inApp: true, ...p });

describe("classroom feed", () => {
  it("sorts newest first and drops duplicate ids", () => {
    const out = sortFeed([post("a", 1), post("b", 3), post("a", 1), post("c", 2)]);
    expect(out.map((p) => p.id)).toEqual(["b", "c", "a"]);
  });
  it("has an icon per kind", () => {
    expect(postIcon("milestone")).toBe("⭐");
    expect(postIcon("birthday")).toBe("🎂");
    expect(postIcon("teacher")).toBe("📣");
  });
  it("formats times", () => {
    const now = new Date(2026, 9, 21, 15).getTime();
    expect(formatPostTime(new Date(2026, 9, 21, 8).getTime(), now)).toBe("Today");
    expect(formatPostTime(new Date(2026, 9, 20, 23).getTime(), now)).toBe("Yesterday");
    expect(formatPostTime(new Date(2026, 9, 18, 9).getTime(), now)).toBe("3 days ago");
    expect(formatPostTime(new Date(2026, 9, 2, 9).getTime(), now)).toBe("2 Oct");
  });
  it("opens only web links", () => {
    expect(safeUrl("https://x.com/a.pdf")).toBe("https://x.com/a.pdf");
    expect(safeUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("classroom state", () => {
  it("knows when a student is in no class", () => {
    expect(isNotInClass(EMPTY_CLASSROOM)).toBe(true);
    expect(isNotInClass({ ...EMPTY_CLASSROOM, classes: [{ id: "c", name: "6 A", teacherName: "Ms Tan" }] })).toBe(false);
  });
  it("refetches at most every 2 minutes unless forced", () => {
    expect(shouldRefetch(undefined, 1000)).toBe(true);
    expect(shouldRefetch(1000, 1000 + CLASSROOM_TTL_MS - 1)).toBe(false);
    expect(shouldRefetch(1000, 1000 + CLASSROOM_TTL_MS)).toBe(true);
    expect(shouldRefetch(1000, 2000, true)).toBe(true);
    expect(shouldRefetch(5000, 1000)).toBe(true);
  });
});

describe("tasks", () => {
  it("splits tests the student can take from paper tasks", () => {
    const g = groupTasks([
      task({ id: "old", createdAt: 1 }),
      task({ id: "new", createdAt: 5 }),
      task({ id: "ws", kind: "worksheet", inApp: false, createdAt: 3 }),
      task({ id: "paper-test", inApp: false, createdAt: 4 }),
      task({ id: "empty", questionIds: [], createdAt: 9 }),
    ]);
    expect(g.tests.map((t) => t.id)).toEqual(["new", "old"]);
    expect(g.paper.map((t) => t.id)).toEqual(["empty", "paper-test", "ws"]);
  });
  it("words the worksheet line", () => {
    const t = task({ kind: "worksheet", inApp: false, subtopicId: "s1", level: 1, title: "WS" });
    expect(worksheetLabel(t, () => "Fractions")).toBe("Worksheet from your teacher: Fractions · Level 1");
    expect(worksheetLabel(t, () => undefined)).toBe("Worksheet from your teacher: WS · Level 1");
  });
  it("scores", () => {
    const s = scoreOf({ a: "right", b: "wrong", c: "right" });
    expect(s).toEqual({ right: 2, total: 3 });
    expect(scoreText(s)).toBe("2 out of 3");
    expect(scoreCheer({ right: 3, total: 3 })).toMatch(/Perfect/);
  });
});

describe("homework", () => {
  it("keeps known, not-yet-done questions once each in order", () => {
    const have = (id: string) => id !== "gone";
    expect(homeworkIds(["a", "b", "gone", "a", "c"], have, new Set(["b"]))).toEqual(["a", "c"]);
    expect(homeworkIds(["a"], have, ["a"])).toEqual([]);
  });
});
