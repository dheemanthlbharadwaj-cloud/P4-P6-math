// Server-side marking: level and mini-game answers are checked against the server's own answer key (generated from
// the app's question bundle, see scripts/copy-shared.mjs), never taken from the client. A question the server can't
// mark (unknown id, not auto-markable) counts as wrong.
import { markQuestion, type Question } from "../shared/index.js";
import type { ServerContent, ServerQuestion } from "../content/index.js";

/** `edited`: answers of questions the editor changed since the bundle was built (logic/patchCache.ts); they win over the
 *  bundle's. A null entry = edited into something the server can't mark. */
export function isCorrect(content: ServerContent | undefined, questionId: string, responses: string[], edited?: ReadonlyMap<string, ServerQuestion | null>): boolean {
  const a = edited?.has(questionId) ? edited.get(questionId) : content?.answers[questionId];
  if (!a) return false;
  const q = a.t === "mcq"
    ? { type: "mcq", correctOption: a.o }
    : { type: "open", parts: (a.p ?? []).map((answer) => ({ part: "", answer, display: "" })) };
  return markQuestion(q as unknown as Question, responses).correct;
}
