import { create } from "zustand";
import { persist } from "zustand/middleware";
import { HEARTS_PER_AD, MAX_HEARTS } from "@p6/shared";
import { current, grant, newMeter, spend, type Meter } from "../logic/daily";
import { persistStorage, STORE_PREFIX } from "./storage";


interface PlayerState {
  hearts: Meter;
  subscribed: boolean; // entitlement "unlimited" → hearts never deplete
  /** Spend 1 heart (wrong answer). Returns false if none left. */
  spendHeart: (now?: number) => boolean;
  addHearts: (n?: number, now?: number) => void;
  setSubscribed: (v: boolean) => void;
  reset: () => void;
}

const fresh = () => ({ hearts: newMeter(MAX_HEARTS, Date.now()), subscribed: false });

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      ...fresh(),
      spendHeart: (now = Date.now()) => {
        if (get().subscribed) return true;
        const m = spend(get().hearts, 1, now, MAX_HEARTS);
        if (!m) return false;
        set({ hearts: m });
        return true;
      },
      addHearts: (n = HEARTS_PER_AD, now = Date.now()) => set({ hearts: grant(get().hearts, n, now, MAX_HEARTS) }),
      setSubscribed: (subscribed) => set({ subscribed }),
      reset: () => set(fresh()),
    }),
    { name: `${STORE_PREFIX}player`, storage: persistStorage },
  ),
);

export interface MetersView {
  hearts: number;
  subscribed: boolean;
}

/** Hearts as of `now` (refilled if midnight has passed). */
export function computeMeters(s: Pick<PlayerState, "hearts" | "subscribed">, now: number): MetersView {
  return { hearts: current(s.hearts, now, MAX_HEARTS).value, subscribed: s.subscribed };
}
