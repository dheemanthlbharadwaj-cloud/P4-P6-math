import { describe, expect, it } from "vitest";
import { computeFriendSpots } from "../src/logic/friendSpots";

const topics = [{ id: "t1", subtopics: ["a", "b", "c"] }, { id: "t2", subtopics: ["d", "e"] }];
const done = (...k: string[]) => Object.fromEntries(k.map((x) => [x, { completed: true }]));

describe("computeFriendSpots", () => {
  it("is empty without progress", () => {
    expect(computeFriendSpots(topics, undefined)).toEqual({});
    expect(computeFriendSpots(topics, {})).toEqual({});
  });
  it("picks the furthest completed level in map order", () => {
    expect(computeFriendSpots(topics, done("a#1", "c#1", "b#1"))).toEqual({ t1: "c#1" });
    // a Level 2 beats every Level 1
    expect(computeFriendSpots(topics, done("c#1", "a#2"))).toEqual({ t1: "a#2" });
    expect(computeFriendSpots(topics, done("c#2", "a#3", "b#3"))).toEqual({ t1: "b#3" });
  });
  it("ignores incomplete levels and omits topics with none", () => {
    const levels = { "a#1": { completed: false }, "d#1": { completed: true }, "e#2": { completed: false } };
    expect(computeFriendSpots(topics, levels)).toEqual({ t2: "d#1" });
  });
  it("ignores unknown keys", () => {
    expect(computeFriendSpots(topics, done("zzz#1"))).toEqual({});
  });
});
