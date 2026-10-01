import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Grade } from "@p6/shared";
import { persistStorage, STORE_PREFIX } from "./storage";

export interface ProfileState {
  uid: string | null;
  email: string | null;
  onboarded: boolean;
  grade: Grade;
  fullName: string;
  school: string;
  topicsLearnt: string[];
  psleDate: string; // ISO date
  catName: string;
  friendCode: string;
  starBalance: number; // last server-confirmed balance
  monthlyStars: number;
  /** true once this device has exchanged state with the server profile (bootstrap or restore succeeded). */
  serverSynced: boolean;
  set: (p: Partial<Omit<ProfileState, "set" | "reset">>) => void;
  reset: () => void;
}

export { defaultPsleDate } from "../logic/psle";
import { defaultPsleDate } from "../logic/psle";

const initial = () => ({
  uid: null, email: null, onboarded: false, grade: "P6" as Grade, fullName: "", school: "", topicsLearnt: [] as string[],
  psleDate: defaultPsleDate(), catName: "", friendCode: "", starBalance: 0, monthlyStars: 0, serverSynced: false,
});

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({ ...initial(), set: (p) => set(p), reset: () => set(initial()) }),
    { name: `${STORE_PREFIX}profile`, storage: persistStorage },
  ),
);

export function daysToPsle(iso: string, now = new Date()): number {
  const target = new Date(`${iso}T00:00:00`).getTime();
  return Math.max(0, Math.ceil((target - now.getTime()) / 86_400_000));
}
