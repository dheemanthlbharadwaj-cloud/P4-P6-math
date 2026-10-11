import { describe, expect, it } from "vitest";
import { levelQuestionsToPlay } from "@p6/shared";
import { advance, correctIds, isDone, progressFraction, recordAnswer, skip, startSession, toAnswers } from "./levelSession";

describe("level session", () => {
  it("a wrong answer moves on: the question doesn't come back in this attempt", () => {
    let s = startSession(["a", "b", "c"]);
    s = advance(recordAnswer(s, ["2"], false)); // a wrong
    s = advance(recordAnswer(s, ["1"], true)); // b right
    expect(s.queue).toEqual(["c"]);
    s = advance(recordAnswer(s, ["4"], true));
    expect(isDone(s)).toBe(true);
    expect(correctIds(s)).toEqual(["b", "c"]);
    expect(progressFraction(s)).toBe(1);
  });
  it("records the answer without leaving the question, so leaving mid-question still sends it", () => {
    const s = recordAnswer(startSession(["a", "b"]), ["3"], true);
    expect(s.queue).toEqual(["a", "b"]);
    expect(toAnswers(s)).toEqual([{ questionId: "a", responses: ["3"] }]);
  });
  it("an answer is recorded once", () => {
    const s = recordAnswer(recordAnswer(startSession(["a"]), ["1"], false), ["2"], true);
    expect(s.answers.a).toEqual({ responses: ["1"], correct: false });
  });
  it("skip sends the question to the end of this attempt; unanswered questions aren't sent", () => {
    let s = skip(startSession(["a", "b"]));
    expect(s.queue).toEqual(["b", "a"]);
    s = advance(recordAnswer(s, ["1"], true));
    expect(toAnswers(s).map((a) => a.questionId)).toEqual(["b"]);
  });
  it("3 of 5 right: the next attempt shows only the 2 wrong ones", () => {
    const level = ["a", "b", "c", "d", "e"];
    let s = startSession(levelQuestionsToPlay(level, []));
    for (const ok of [true, false, true, false, true]) s = advance(recordAnswer(s, ["x"], ok));
    expect(levelQuestionsToPlay(level, correctIds(s))).toEqual(["b", "d"]);
  });
});
