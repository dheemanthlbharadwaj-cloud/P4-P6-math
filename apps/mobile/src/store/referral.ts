// Friend code typed at sign-up, kept until the account's profile exists on the server and the code was redeemed once.
// `notice` is the result popup shown on the map ("welcome" with the stars we got, or "failed").
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage, STORE_PREFIX } from "./storage";

export type ReferralNotice = { kind: "welcome"; stars: number } | { kind: "failed" } | null;

interface ReferralState {
  pendingCode: string;
  notice: ReferralNotice;
  set: (p: Partial<Pick<ReferralState, "pendingCode" | "notice">>) => void;
  reset: () => void;
}

export const useReferral = create<ReferralState>()(
  persist(
    (set) => ({ pendingCode: "", notice: null, set: (p) => set(p), reset: () => set({ pendingCode: "", notice: null }) }),
    { name: `${STORE_PREFIX}referral`, storage: persistStorage },
  ),
);
