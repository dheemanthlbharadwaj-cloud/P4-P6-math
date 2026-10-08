import { describe, expect, it } from "vitest";
import { answer, recordAnswer, startSession, toAnswers } from "./levelSession";

describe("recordAnswer", () => {
  it("records the answer without leaving the question, so leaving mid-question still sends it", () => {
    const s = recordAnswer(startSession(["a", "b"]), true);
    expect(s.firstTry).toEqual({ a: true });
    expect(s.queue).toEqual(["a", "b"]); // still on the same question
    expect(toAnswers(s, ["a", "b"])[0].firstTryCorrect).toBe(true);
  });
  it("keeps the first try's outcome when the question is answered again", () => {
    let s = recordAnswer(startSession(["a"]), false);
    s = answer(s, false);
    s = recordAnswer(s, true);
    expect(s.firstTry).toEqual({ a: false });
    expect(s.everWrong).toEqual({ a: true });
  });
});
