import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LevelResult } from "@p6/shared";
import { persistStorage, STORE_PREFIX } from "./storage";

interface QueueState {
  items: LevelResult[];
  enqueue: (r: LevelResult) => void;
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
