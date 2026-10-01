import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ENERGY_PER_LEVEL, ENERGY_RECOVERY_MINUTES, HEARTS_PER_AD, HEART_RECOVERY_MINUTES, MAX_ENERGY, MAX_HEARTS, ENERGY_PER_AD,
} from "@p6/shared";
import { grant, newMeter, regen, spend, type Meter } from "../logic/regen";
import { persistStorage, STORE_PREFIX } from "./storage";

export const HEART_PERIOD_MS = HEART_RECOVERY_MINUTES * 60_000;
export const ENERGY_PERIOD_MS = ENERGY_RECOVERY_MINUTES * 60_000;

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
        const m = spend(get().hearts, 1, now, MAX_HEARTS, HEART_PERIOD_MS);
        if (!m) return false;
        set({ hearts: m });
        return true;
      },
      spendEnergy: (now = Date.now()) => {
        if (get().subscribed) return true;
        const m = spend(get().energy, ENERGY_PER_LEVEL, now, MAX_ENERGY, ENERGY_PERIOD_MS);
        if (!m) return false;
        set({ energy: m });
        return true;
      },
      addHearts: (n = HEARTS_PER_AD, now = Date.now()) => set({ hearts: grant(get().hearts, n, now, MAX_HEARTS, HEART_PERIOD_MS) }),
      addEnergy: (n = ENERGY_PER_AD, now = Date.now()) => set({ energy: grant(get().energy, n, now, MAX_ENERGY, ENERGY_PERIOD_MS) }),
      setSubscribed: (subscribed) => set({ subscribed }),
      reset: () => set(fresh()),
    }),
    { name: `${STORE_PREFIX}player`, storage: persistStorage },
  ),
);

export interface MetersView {
  hearts: number;
  energy: number;
  heartNextMs: number | null;
  energyNextMs: number | null;
  /** The soonest recovery countdown (what the top bar shows). */
  nextMs: number | null;
  subscribed: boolean;
}

export function computeMeters(s: Pick<PlayerState, "hearts" | "energy" | "subscribed">, now: number): MetersView {
  const h = regen(s.hearts, now, MAX_HEARTS, HEART_PERIOD_MS);
  const e = regen(s.energy, now, MAX_ENERGY, ENERGY_PERIOD_MS);
  const nexts = [h.nextInMs, e.nextInMs].filter((x): x is number => x != null);
  return {
    hearts: h.meter.value,
    energy: e.meter.value,
    heartNextMs: h.nextInMs,
    energyNextMs: e.nextInMs,
    nextMs: s.subscribed || nexts.length === 0 ? null : Math.min(...nexts),
    subscribed: s.subscribed,
  };
}
