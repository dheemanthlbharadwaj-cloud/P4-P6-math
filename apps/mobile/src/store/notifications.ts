// Notification settings and the little local data the reminders need. Persisted as `p6.notifications`.
// Per account (registered in reset.ts): a different account on the same phone must not inherit someone else's
// reminder time, and `lastPracticeDay` describes that student's practice.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_PRACTICE_MINUTES, dayKey, snapSlot } from "../logic/notifications";
import { persistStorage, STORE_PREFIX } from "./storage";

interface NotificationsState {
  practiceEnabled: boolean; // off until the kid turns it on
  practiceMinutes: number; // minutes after local midnight, one of the 30-minute slots
  heartsFullEnabled: boolean; // on by default
  /** Local day (dayKey) of the last answered question: the reminder for that day is skipped. */
  lastPracticeDay: string;
  /** The permission question was already asked because the hearts ran out (ask only once that way). */
  askedWhenHeartsOut: boolean;
  set: (p: Partial<Pick<NotificationsState, "practiceEnabled" | "practiceMinutes" | "heartsFullEnabled" | "askedWhenHeartsOut">>) => void;
  /** The kid answered a question (level, mini game or practice). */
  markPractised: (now?: number) => void;
  reset: () => void;
}

const initial = () => ({
  practiceEnabled: false, practiceMinutes: DEFAULT_PRACTICE_MINUTES, heartsFullEnabled: true,
  lastPracticeDay: "", askedWhenHeartsOut: false,
});

export const useNotifications = create<NotificationsState>()(
  persist(
    (set, get) => ({
      ...initial(),
      set: (p) => set({ ...p, ...(p.practiceMinutes !== undefined ? { practiceMinutes: snapSlot(p.practiceMinutes) } : {}) }),
      markPractised: (now = Date.now()) => {
        const d = dayKey(now);
        if (get().lastPracticeDay !== d) set({ lastPracticeDay: d }); // one write per day
      },
      reset: () => set(initial()),
    }),
    { name: `${STORE_PREFIX}notifications`, storage: persistStorage },
  ),
);
