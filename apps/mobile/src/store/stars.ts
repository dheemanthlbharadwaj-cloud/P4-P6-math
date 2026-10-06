// Stars earned on this device, applied right away (rules in @p6/shared stars.ts). The server recomputes the same rules
// when results reach it and its balances win (bootstrap / sync); until the backend is live this is the only ledger.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { levelKey, QUESTS, questState, type Grade, type LevelNo } from "@p6/shared";
import { useProfile } from "./profile";
import { useCosmetics } from "./cosmetics";
import { persistStorage, STORE_PREFIX } from "./storage";

interface StarsState {
  totalStars: number; // lifetime stars earned (quests)
  claimedQuests: string[];
  starredLevels: Record<string, true>; // `${grade}:${subtopicId}#${level}` → the level has given a star
  attempted: Record<string, true>; // `${grade}:${questionId}` → attempted at least once (levels or mini games)
  /** Credit stars: spendable balance, this month's stars (leaderboard) and lifetime stars (quests). */
  award: (n: number) => void;
  isLevelStarred: (grade: Grade, subtopicId: string, level: LevelNo) => boolean;
  markLevelStarred: (grade: Grade, subtopicId: string, level: LevelNo) => void;
  wasAttempted: (grade: Grade, questionId: string) => boolean;
  markAttempted: (grade: Grade, questionId: string) => void;
  /** Claim a quest whose goal is reached: its reward joins the cat's wardrobe. Returns the reward id. */
  claimQuest: (questId: string) => string | null;
  /** Server-confirmed values (bootstrap / restore). */
  setServer: (s: { totalStars: number; claimedQuests: string[] }) => void;
  set: (p: Partial<Pick<StarsState, "totalStars" | "claimedQuests" | "starredLevels" | "attempted">>) => void;
  reset: () => void;
}

const initial = () => ({ totalStars: 0, claimedQuests: [] as string[], starredLevels: {} as Record<string, true>, attempted: {} as Record<string, true> });
const lk = (grade: Grade, subtopicId: string, level: LevelNo) => `${grade}:${levelKey(subtopicId, level)}`;

export const useStars = create<StarsState>()(
  persist(
    (set, get) => ({
      ...initial(),
      award: (n) => {
        if (n <= 0) return;
        const p = useProfile.getState();
        p.set({ starBalance: p.starBalance + n, monthlyStars: p.monthlyStars + n });
        set({ totalStars: get().totalStars + n });
      },
      isLevelStarred: (grade, subtopicId, level) => !!get().starredLevels[lk(grade, subtopicId, level)],
      markLevelStarred: (grade, subtopicId, level) => set({ starredLevels: { ...get().starredLevels, [lk(grade, subtopicId, level)]: true } }),
      wasAttempted: (grade, questionId) => !!get().attempted[`${grade}:${questionId}`],
      markAttempted: (grade, questionId) => set({ attempted: { ...get().attempted, [`${grade}:${questionId}`]: true } }),
      claimQuest: (questId) => {
        const q = QUESTS.find((x) => x.id === questId);
        if (!q || questState(q, get().totalStars, get().claimedQuests) !== "ready") return null;
        set({ claimedQuests: [...get().claimedQuests, q.id] });
        useCosmetics.getState().grantOwned([q.rewardId]);
        return q.rewardId;
      },
      setServer: (s) => set({ totalStars: s.totalStars, claimedQuests: s.claimedQuests }),
      set: (p) => set(p),
      reset: () => set(initial()),
    }),
    { name: `${STORE_PREFIX}stars`, storage: persistStorage },
  ),
);
