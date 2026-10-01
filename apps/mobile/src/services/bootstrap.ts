import type { AccountState, BootstrapProfileResponse, UserProfile } from "@p6/shared";
import { api } from "./api";
import { pullAndMerge, pushProfile, startCloudSync } from "./cloudSync";
import { useProfile } from "../store/profile";
import { useCosmetics } from "../store/cosmetics";
import { usePlayer } from "../store/player";
import { useFriends } from "../store/friends";
import { useProgress } from "../store/progress";

/** Server-owned state always wins: stars, inventory, entitlement. */
function applyAccount(a: AccountState, friendCode: string) {
  useProfile.getState().set({ friendCode, starBalance: a.starBalance, monthlyStars: a.monthlyStars });
  useCosmetics.getState().grantOwned(a.ownedItems);
  usePlayer.getState().setSubscribed(a.subscribed); // RevenueCat (initPurchases) runs after and may override
}

/** Rebuild the local profile + look from the server copy (new device / reinstall). */
function adoptServerProfile(profile: UserProfile, a: AccountState) {
  useProfile.getState().set({
    fullName: profile.fullName, school: profile.school, grade: profile.grade, topicsLearnt: profile.topicsLearnt,
    psleDate: profile.psleDate || useProfile.getState().psleDate, catName: profile.cat.name, onboarded: true,
  });
  useCosmetics.getState().grantOwned(a.ownedItems);
  useCosmetics.getState().setLook(a.equipped);
  useProgress.getState().ensureGrade(profile.grade, profile.topicsLearnt);
}

async function finishSync(res: BootstrapProfileResponse, profile: UserProfile) {
  applyAccount(res, profile.friendCode);
  useProfile.getState().set({ serverSynced: true });
  await pullAndMerge(profile.grade); // progress + wrong bookmarks, merged by max / union
  startCloudSync(); // from now on local changes are pushed
}

/**
 * Right after sign-in on a device that has no local profile: if the account already has one on the server, restore
 * everything (profile, stars, inventory, equipped look, entitlement, progress, wrong bookmarks).
 * "new" = no server profile, run onboarding; "offline" = could not tell, run onboarding (bootstrapServerProfile
 * adopts the server copy later if it turns out the account existed).
 */
export async function restoreAccount(): Promise<"restored" | "new" | "offline"> {
  try {
    const res = await api.bootstrapProfile({ restoreOnly: true });
    if (!res.profile) return "new";
    adoptServerProfile(res.profile, res);
    await finishSync(res, res.profile);
    return "restored";
  } catch {
    return "offline";
  }
}

/**
 * Create/refresh the server profile after onboarding (idempotent on the server). Silent offline.
 * First contact with an account that already existed (created=false, never synced here) adopts the server copy;
 * afterwards this device is the authority for profile fields + look, which are pushed back.
 */
export async function bootstrapServerProfile(): Promise<boolean> {
  const p = useProfile.getState();
  if (!p.onboarded) return false;
  try {
    const res = await api.bootstrapProfile({
      fullName: p.fullName, school: p.school, grade: p.grade, topicsLearnt: p.topicsLearnt, psleDate: p.psleDate, catName: p.catName,
    });
    const profile = res.profile!;
    if (!res.created && !p.serverSynced) adoptServerProfile(profile, res);
    await finishSync(res, profile);
    if (res.created || p.serverSynced) void pushProfile();
    return true;
  } catch {
    return false;
  }
}

/** Refresh the friends cache used by the map (daily leaderboard = friends). Hides gracefully on failure. */
export async function refreshFriends(): Promise<void> {
  try {
    const res = await api.getLeaderboard({ scope: "daily" });
    useFriends.getState().set(res.friends.filter((f) => f.uid !== res.selfUid));
  } catch {
    /* offline: keep whatever we had */
  }
}
