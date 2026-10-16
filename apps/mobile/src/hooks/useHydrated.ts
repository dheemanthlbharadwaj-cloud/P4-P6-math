import { useEffect, useState } from "react";
import { usePlayer } from "../store/player";
import { useProgress } from "../store/progress";
import { useWrong } from "../store/wrong";
import { useOfflineQueue } from "../store/queue";
import { useProfile } from "../store/profile";
import { useCosmetics } from "../store/cosmetics";
import { useQuestionPatches } from "../store/questionPatches";
import { useNotifications } from "../store/notifications";

const stores = [usePlayer, useProgress, useWrong, useOfflineQueue, useProfile, useCosmetics, useQuestionPatches, useNotifications];

/** True once every persisted store has been rehydrated from AsyncStorage. */
export function useHydrated(): boolean {
  const check = () => stores.every((s) => s.persist.hasHydrated());
  const [ready, setReady] = useState(check);
  useEffect(() => {
    if (check()) return setReady(true);
    const unsubs = stores.map((s) => s.persist.onFinishHydration(() => check() && setReady(true)));
    return () => unsubs.forEach((u) => u());
  }, []);
  return ready;
}
