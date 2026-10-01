import { useOfflineQueue } from "../store/queue";
import { useProfile } from "../store/profile";
import { api, ApiError } from "./api";

let flushing = false;

/** Replay queued level results in order. Stops at the first transient failure (offline). Idempotent server-side. */
export async function flushOfflineQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of [...useOfflineQueue.getState().items]) {
      try {
        const res = await api.submitLevelResult(item);
        useProfile.getState().set({ starBalance: res.starBalance, monthlyStars: res.monthlyStars });
        useOfflineQueue.getState().remove(item.attemptId);
        sent++;
      } catch (e) {
        if (e instanceof ApiError && !e.transient) {
          console.warn("Dropping unsendable level result", item.attemptId, e.code);
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
