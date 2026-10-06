import { describe, expect, it } from "vitest";
import { QUESTS, QUEST_ITEMS, questState, starsForLevelAnswer, starsForLevelAttempt, starsForLevelCompletion, starsForMinigameAnswer } from "../src/stars";

describe("level stars", () => {
  it("first time: one star per question right on the first try", () => {
    const answers = [
      { questionId: "a", correct: true }, { questionId: "b", correct: false }, { questionId: "c", correct: true },
      { questionId: "d", correct: true }, { questionId: "e", correct: true }, { questionId: "b", correct: true },
    ];
    expect(starsForLevelAttempt(answers, true, false)).toBe(4); // b was wrong first
  });
  it("first time: stars count even if the level is not finished", () => {
    expect(starsForLevelAttempt([{ questionId: "a", correct: true }, { questionId: "b", correct: false }], false, false)).toBe(1);
  });
  it("re-attempt: one star for completing the level, none per question", () => {
    const all = ["a", "b", "c", "d", "e"].map((questionId) => ({ questionId, correct: true }));
    expect(starsForLevelAttempt(all, true, true)).toBe(1);
    expect(starsForLevelAttempt(all.slice(0, 3), false, true)).toBe(0);
    expect(starsForLevelAnswer(true, true, true)).toBe(0);
    expect(starsForLevelCompletion(true, true)).toBe(1);
    expect(starsForLevelCompletion(true, false)).toBe(0);
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
