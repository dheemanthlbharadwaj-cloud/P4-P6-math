// Daily quests: pure parts (progress → states, claim validation). Pure.
import { DAILY_QUESTS, type DailyQuest, type DailyQuestState } from "../shared/index.js";
import type { Fail, Ok } from "./rules.js";

export interface DailyProgress {
  answers: number; // today's questionsDone
  friends: number; // friendships created today
}

export function questProgress(q: Pick<DailyQuest, "kind">, p: DailyProgress): number {
  const raw = q.kind === "answers" ? p.answers : p.friends;
  return Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
}

export function dailyQuestStates(p: DailyProgress, claimed: readonly string[]): DailyQuestState[] {
  return DAILY_QUESTS.map((q) => ({
    id: q.id, progress: Math.min(questProgress(q, p), q.target), target: q.target, stars: q.stars, claimed: claimed.includes(q.id),
  }));
}

export function validateDailyClaim(i: { questId: unknown; progress: DailyProgress; claimed: readonly string[] }): Fail | Ok<{ quest: DailyQuest }> {
  const quest = DAILY_QUESTS.find((q) => q.id === i.questId);
  if (!quest) return { ok: false, code: "invalid-argument", message: "unknown daily quest" };
  if (i.claimed.includes(quest.id)) return { ok: false, code: "already-exists", message: "already claimed today" };
  if (questProgress(quest, i.progress) < quest.target) return { ok: false, code: "failed-precondition", message: "not done yet" };
  return { ok: true, quest };
}
