import { describe, expect, it } from "vitest";
import { levelAttemptStars, levelQuestionsToPlay, QUESTS, QUEST_ITEMS, questState, starsForMinigameAnswer } from "../src/stars";

describe("level stars", () => {
  const level = ["a", "b", "c", "d", "e"];
  it("one star per question answered right; wrong ones wait for the next attempt", () => {
    const r = levelAttemptStars(level, [], ["a", "c", "e"], false); // 3 of 5 right
    expect(r).toMatchObject({ stars: 3, newIds: ["a", "c", "e"], correctIds: ["a", "c", "e"], complete: false, bonus: false });
    expect(levelQuestionsToPlay(level, r.correctIds)).toEqual(["b", "d"]); // next time: only the 2 wrong ones
  });
  it("answering the rest completes the level (star button)", () => {
    const r = levelAttemptStars(level, ["a", "c", "e"], ["b", "d"], false);
    expect(r).toMatchObject({ stars: 2, correctIds: level, complete: true, bonus: false });
    expect(levelQuestionsToPlay(level, r.correctIds)).toEqual(level); // complete: a replay shows all 5
  });
  it("a question that already has its star never pays again", () => {
    expect(levelAttemptStars(level, ["a"], ["a", "b"], false).stars).toBe(1);
  });
  it("a complete level pays one bonus star for a replay with all 5 right, once", () => {
    expect(levelAttemptStars(level, level, level, false)).toMatchObject({ stars: 1, bonus: true, complete: true });
    expect(levelAttemptStars(level, level, level, true)).toMatchObject({ stars: 0, bonus: false });
    expect(levelAttemptStars(level, level, ["a", "b", "c", "d"], false)).toMatchObject({ stars: 0, bonus: false });
  });
  it("finishing the level is not a bonus (only a replay of a complete level is)", () => {
    expect(levelAttemptStars(level, [], level, false)).toMatchObject({ stars: 5, bonus: false, complete: true });
  });
  it("ignores questions that are not in the level", () => {
    expect(levelAttemptStars(level, ["zz"], ["zz", "a"], false)).toMatchObject({ stars: 1, correctIds: ["a"] });
  });
});

describe("mini-game stars", () => {
  it("one star per new question answered right; none for re-attempts or wrong answers", () => {
    expect(starsForMinigameAnswer(true, false)).toBe(1);
    expect(starsForMinigameAnswer(true, true)).toBe(0);
    expect(starsForMinigameAnswer(false, false)).toBe(0);
  });
});

describe("quests", () => {
  it("unlock at 25, 50, 75, 100 … lifetime stars and stay claimed", () => {
    expect(QUESTS.map((q) => q.stars)).toEqual([25, 50, 75, 100, 150, 200]);
    const q = QUESTS[0];
    expect(questState(q, 24, [])).toBe("locked");
    expect(questState(q, 25, [])).toBe("ready");
    expect(questState(q, 0, [q.id])).toBe("claimed");
  });
  it("every reward is a quest item", () => {
    for (const q of QUESTS) expect(QUEST_ITEMS.some((i) => i.id === q.rewardId)).toBe(true);
  });
});

import { nameProblem, tidyName } from "../src/names";
describe("player names", () => {
  it("accepts real names in any alphabet, with name marks", () => {
    for (const n of ["Dheemanth", "Tan Wei Ling", "Nur Aisyah binti Ahmad", "O'Brien", "Jean-Luc", "陈小明", "Mochi 2", "Siti (Ana)"]) expect(nameProblem(n, 60), n).toBeNull();
  });
  it("tidies spaces", () => expect(tidyName("  Tan   Wei  ")).toBe("Tan Wei"));
  it("rejects links, contact details, symbols and rude words", () => {
    expect(nameProblem("visit www.spam.com", 60)).toBe("link");
    expect(nameProblem("me@mail.sg", 60)).toBe("link");
    expect(nameProblem("call 9123 4567", 60)).toBe("contact");
    expect(nameProblem("<script>", 60)).toBe("characters");
    expect(nameProblem("you stupid", 60)).toBe("rude");
    expect(nameProblem("F U C K E R", 60)).toBe("rude");
    expect(nameProblem("", 60)).toBe("empty");
    expect(nameProblem("x".repeat(21), 20)).toBe("too-long");
  });
  it("doesn't flag names that merely contain a short blocked word", () => {
    for (const n of ["Dickson", "Cocker", "Diana", "Butterfly", "Sussex", "Babila"]) expect(nameProblem(n, 60), n).toBeNull();
  });
});
