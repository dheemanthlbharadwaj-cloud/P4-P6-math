import { describe, expect, it } from "vitest";
import type { Question } from "@p6/shared";
import { chooseKeyQuestion, rememberKeyQuestion } from "./keyQuestion";

const q = (id: string) => ({ id }) as Question;
const pool = [q("a"), q("b"), q("c")];

describe("chooseKeyQuestion", () => {
  it("picks randomly the first time and asks to remember it", () => {
    const r = chooseKeyQuestion(pool, undefined, () => 0.5);
    expect(r?.question.id).toBe("b");
    expect(r?.remember).toBe("b");
  });
  it("reuses the remembered question whatever the random value", () => {
    for (const x of [0, 0.5, 0.99]) {
      const r = chooseKeyQuestion(pool, "c", () => x);
      expect(r?.question.id).toBe("c");
      expect(r?.remember).toBeUndefined();
    }
  });
  it("picks a new one when the remembered question is gone", () => {
    const r = chooseKeyQuestion(pool, "gone", () => 0);
    expect(r?.question.id).toBe("a");
    expect(r?.remember).toBe("a");
  });
  it("returns nothing for an empty pool", () => {
    expect(chooseKeyQuestion([], "a")).toBeUndefined();
  });
});

describe("rememberKeyQuestion", () => {
  it("sets, keeps identity when unchanged, and clears", () => {
    const m = rememberKeyQuestion(undefined, "t1", "a");
    expect(m).toEqual({ t1: "a" });
    expect(rememberKeyQuestion(m, "t1", "a")).toBe(m);
    expect(rememberKeyQuestion(m, "t2", "b")).toEqual({ t1: "a", t2: "b" });
    expect(rememberKeyQuestion(m, "t1", undefined)).toEqual({});
    expect(rememberKeyQuestion({}, "t1", undefined)).toEqual({});
  });
});
