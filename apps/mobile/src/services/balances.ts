import { useProfile } from "../store/profile";
import { useStars } from "../store/stars";

/** Apply server-confirmed star balances (from redeemReferral / claimDailyQuest) to the local stores. */
export function applyBalances(b: { starBalance: number; monthlyStars: number; totalStars: number }) {
  useProfile.getState().set({ starBalance: b.starBalance, monthlyStars: b.monthlyStars });
  useStars.getState().set({ totalStars: b.totalStars });
}
