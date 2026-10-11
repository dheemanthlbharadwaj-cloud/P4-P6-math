// Server-side marking: level and mini-game answers are checked against the server's own answer key (generated from
// the app's question bundle, see scripts/copy-shared.mjs), never taken from the client. A question the server can't
// mark (unknown id, not auto-markable) counts as wrong.
import { markQuestion, type Question } from "../shared/index.js";
import type { ServerContent } from "../content/index.js";

export function isCorrect(content: ServerContent | undefined, questionId: string, responses: string[]): boolean {
  const a = content?.answers[questionId];
  if (!a) return false;
  const q = a.t === "mcq"
    ? { type: "mcq", correctOption: a.o }
    : { type: "open", parts: (a.p ?? []).map((answer) => ({ part: "", answer, display: "" })) };
  return markQuestion(q as unknown as Question, responses).correct;
}
