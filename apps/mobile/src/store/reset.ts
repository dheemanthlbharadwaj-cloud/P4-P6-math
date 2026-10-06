import { usePlayer } from "./player";
import { useProgress } from "./progress";
import { useWrong } from "./wrong";
import { useOfflineQueue } from "./queue";
import { useProfile } from "./profile";
import { useCosmetics } from "./cosmetics";
import { useFriends } from "./friends";
import { useStars } from "./stars";

/** Wipe all local data (account deletion / sign-out). */
export function resetAllStores() {
  usePlayer.getState().reset();
  useProgress.getState().reset();
  useWrong.getState().reset();
  useOfflineQueue.getState().reset();
  useProfile.getState().reset();
  useCosmetics.getState().reset();
  useFriends.getState().reset();
  useStars.getState().reset();
}
