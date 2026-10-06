import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LevelResult, MinigameResult } from "@p6/shared";
import { persistStorage, STORE_PREFIX } from "./storage";

/** Results waiting for the server: level results, and mini-game rounds (tagged so the flush knows which call). */
export type QueuedResult = LevelResult | (MinigameResult & { kind: "minigame" });

interface QueueState {
  items: QueuedResult[];
  enqueue: (r: QueuedResult) => void;
  remove: (attemptId: string) => void;
  reset: () => void;
}

export const useOfflineQueue = create<QueueState>()(
  persist(
    (set, get) => ({
      items: [],
      enqueue: (r) => (get().items.some((i) => i.attemptId === r.attemptId) ? undefined : set({ items: [...get().items, r] })),
      remove: (attemptId) => set({ items: get().items.filter((i) => i.attemptId !== attemptId) }),
      reset: () => set({ items: [] }),
    }),
    { name: `${STORE_PREFIX}queue`, storage: persistStorage },
  ),
);
