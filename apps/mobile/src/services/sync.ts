import { useOfflineQueue } from "../store/queue";
import { useProfile } from "../store/profile";
import { useProgress } from "../store/progress";
import { getLevelQuestions } from "../content";
import { api, ApiError } from "./api";

let flushing = false;

/** Replay queued level results and mini-game rounds in order. Stops at the first transient failure (offline). Idempotent server-side. */
export async function flushOfflineQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of [...useOfflineQueue.getState().items]) {
      try {
        let res: { starBalance: number; monthlyStars: number };
        if ("kind" in item) {
          const { kind: _kind, ...round } = item;
          res = await api.submitMinigameResult(round);
        } else {
          const lr = await api.submitLevelResult(item);
          res = lr;
          // The server's record of the level's stars (it marked the answers itself) joins this device's map.
          if (lr.levelCorrectIds?.length) {
            const levelIds = getLevelQuestions(item.grade, item.subtopicId, item.level).map((q) => q.id);
            useProgress.getState().recordLevel(item.grade, item.subtopicId, item.level, lr.levelCorrectIds, levelIds);
          }
        }
        useProfile.getState().set({ starBalance: res.starBalance, monthlyStars: res.monthlyStars });
        useOfflineQueue.getState().remove(item.attemptId);
        sent++;
      } catch (e) {
        if (e instanceof ApiError && !e.transient) {
          console.warn("Dropping unsendable result", item.attemptId, e.code);
          useOfflineQueue.getState().remove(item.attemptId);
          continue;
        }
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}
