import { describe, expect, it } from "vitest";
import { levelQuestionsToPlay } from "@p6/shared";
import { advance, canRetry, correctIds, isDone, triedWrong, progressFraction, recordAnswer, skip, startSession, toAnswers } from "./levelSession";

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
  it("a right answer is final", () => {
    const s = recordAnswer(recordAnswer(startSession(["a"]), ["1"], true), ["2"], false);
    expect(s.answers.a).toEqual({ responses: ["1"], correct: true });
  });
  it("MCQ retry: wrong tries stay marked, the right pick on a retry replaces the answer sent (star earned)", () => {
    let s = startSession(["a", "b"]);
    s = recordAnswer(s, ["2"], false);
    s = recordAnswer(s, ["3"], false);
    expect(triedWrong(s)).toEqual(["2", "3"]);
    expect(s.queue).toEqual(["a", "b"]); // still on the same question
    expect(correctIds(s)).toEqual([]);
    s = recordAnswer(s, ["1"], true);
    expect(correctIds(s)).toEqual(["a"]);
    expect(toAnswers(s)).toEqual([{ questionId: "a", responses: ["1"] }]); // one entry, the final pick
    expect(triedWrong(s)).toEqual(["2", "3"]);
    s = advance(s);
    expect(triedWrong(s)).toEqual([]); // next question starts clean
  });
  it("MCQ retried wrong then skipped: the question leaves the queue unanswered-right", () => {
    let s = recordAnswer(startSession(["a", "b"]), ["2"], false);
    s = advance(s);
    expect(s.queue).toEqual(["b"]);
    expect(correctIds(s)).toEqual([]);
    expect(levelQuestionsToPlay(["a", "b"], correctIds(s))).toEqual(["a", "b"]);
  });
  it("only MCQs can be retried", () => {
    expect(canRetry("mcq", false)).toBe(true);
    expect(canRetry("mcq", true)).toBe(false);
    expect(canRetry("open", false)).toBe(false);
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
