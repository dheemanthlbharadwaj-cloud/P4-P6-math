// Answer checking — pure, shared by the app (marking) and the content pipeline (autoMarkable check).
// IMPLEMENTED BY: backend agent (with unit tests in packages/shared/test). Signatures are frozen.
import type { AnswerSpec, Question } from "./types";

/** Normalize raw student input (trim, strip units/＄/commas, unify unicode minus, etc.). */
export function normalizeInput(raw: string): string {
  throw new Error("not implemented");
}

/** True if `raw` satisfies `spec`. Accepts equivalent forms: 0.5 = 1/2, 1 1/2 = 3/2 = 1.5, "3 : 4" = "3:4". */
export function checkAnswer(spec: AnswerSpec, raw: string): boolean {
  throw new Error("not implemented");
}

/** Mark a whole question. MCQ: `responses[0]` is the option key. Open: one response per part, in order. */
export function markQuestion(q: Question, responses: string[]): { correct: boolean; perPart: boolean[] } {
  throw new Error("not implemented");
}
