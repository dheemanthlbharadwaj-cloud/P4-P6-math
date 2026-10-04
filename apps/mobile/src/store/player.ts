import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ENERGY_PER_LEVEL, HEARTS_PER_AD, MAX_ENERGY, MAX_HEARTS, ENERGY_PER_AD,
} from "@p6/shared";
import { current, grant, newMeter, spend, type Meter } from "../logic/daily";
import { persistStorage, STORE_PREFIX } from "./storage";


interface PlayerState {
  hearts: Meter;
  energy: Meter;
  subscribed: boolean; // entitlement "unlimited" → hearts/energy never deplete
  /** Spend 1 heart (wrong answer). Returns false if none left. */
  spendHeart: (now?: number) => boolean;
  /** Spend the level-start energy cost. Returns false if not enough. */
  spendEnergy: (now?: number) => boolean;
  addHearts: (n?: number, now?: number) => void;
  addEnergy: (n?: number, now?: number) => void;
  setSubscribed: (v: boolean) => void;
  reset: () => void;
}

const fresh = () => ({ hearts: newMeter(MAX_HEARTS, Date.now()), energy: newMeter(MAX_ENERGY, Date.now()), subscribed: false });

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
      spendEnergy: (now = Date.now()) => {
        if (get().subscribed) return true;
        const m = spend(get().energy, ENERGY_PER_LEVEL, now, MAX_ENERGY);
        if (!m) return false;
        set({ energy: m });
        return true;
      },
      addHearts: (n = HEARTS_PER_AD, now = Date.now()) => set({ hearts: grant(get().hearts, n, now, MAX_HEARTS) }),
      addEnergy: (n = ENERGY_PER_AD, now = Date.now()) => set({ energy: grant(get().energy, n, now, MAX_ENERGY) }),
      setSubscribed: (subscribed) => set({ subscribed }),
      reset: () => set(fresh()),
    }),
    { name: `${STORE_PREFIX}player`, storage: persistStorage },
  ),
);

export interface MetersView {
  hearts: number;
  energy: number;
  subscribed: boolean;
}

/** Hearts and energy as of `now` (refilled if midnight has passed). */
export function computeMeters(s: Pick<PlayerState, "hearts" | "energy" | "subscribed">, now: number): MetersView {
  return { hearts: current(s.hearts, now, MAX_HEARTS).value, energy: current(s.energy, now, MAX_ENERGY).value, subscribed: s.subscribed };
}
