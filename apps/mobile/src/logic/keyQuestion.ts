// "Find the key": the question is picked once per topic map and remembered until the key is earned.
import type { Question } from "@p6/shared";

/**
 * Reuse the remembered question while it is still a usable candidate (it can vanish with a bundle update or an editor
 * retire); otherwise pick a random one. `remember` is the id to store when it changed (undefined = nothing to store).
 */
export function chooseKeyQuestion(
  candidates: readonly Question[],
  rememberedId: string | undefined,
  rand: () => number = Math.random,
): { question: Question; remember?: string } | undefined {
  const kept = rememberedId ? candidates.find((q) => q.id === rememberedId) : undefined;
  if (kept) return { question: kept };
  if (!candidates.length) return undefined;
  const question = candidates[Math.floor(rand() * candidates.length)];
  return { question, remember: question.id };
}

/** Immutable update of a grade's topicId → questionId map; returns the same object when nothing changes. */
export function rememberKeyQuestion(
  map: Record<string, string> | undefined,
  topicId: string,
  questionId: string | undefined,
): Record<string, string> {
  const cur = map ?? {};
  if (cur[topicId] === questionId) return cur;
  const next = { ...cur };
  if (questionId === undefined) delete next[topicId];
  else next[topicId] = questionId;
  return next;
}
