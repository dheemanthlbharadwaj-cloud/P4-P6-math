import { api } from "./api";
import { useProfile } from "../store/profile";
import { useCosmetics } from "../store/cosmetics";
import { usePlayer } from "../store/player";
import { useFriends } from "../store/friends";

/** Create/refresh the server profile after onboarding (idempotent on the server). Silent offline. */
export async function bootstrapServerProfile(referralCode?: string): Promise<boolean> {
  const p = useProfile.getState();
  try {
    const res = await api.bootstrapProfile({
      fullName: p.fullName, school: p.school, grade: p.grade, topicsLearnt: p.topicsLearnt, psleDate: p.psleDate, catName: p.catName, referralCode,
    });
    useProfile.getState().set({
      friendCode: res.profile.friendCode, starBalance: res.starBalance, monthlyStars: res.monthlyStars,
    });
    useCosmetics.getState().grantOwned(res.ownedItems);
    if (res.equipped) {
      useCosmetics.getState().equip(res.equipped.colorId, "color");
      if (res.equipped.hatId) useCosmetics.getState().equip(res.equipped.hatId, "hat");
    }
    usePlayer.getState().setSubscribed(res.subscribed || usePlayer.getState().subscribed);
    return true;
  } catch {
    return false;
  }
}

/** Refresh the friends cache used by the map (daily leaderboard = friends). Hides gracefully on failure. */
export async function refreshFriends(): Promise<void> {
  try {
    const res = await api.getLeaderboard({ scope: "daily", grade: useProfile.getState().grade });
    const self = res.selfUid;
    useFriends.getState().set((res.friends ?? []).filter((f) => f.uid !== self));
  } catch {
    /* offline: keep whatever we had */
  }
}
