// The app is portrait-only except question screens (level / minigame / practice), which may rotate so the
// scratchpad can sit beside the question. Screens call this hook; the root layout locks portrait at start.
import { useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

export async function lockPortrait() {
  try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch { /* web / unsupported */ }
}
async function unlockAll() {
  try { await ScreenOrientation.unlockAsync(); } catch { /* web / unsupported */ }
}

let active = 0;

export function useQuestionOrientation() {
  useEffect(() => {
    active++;
    void unlockAll();
    return () => {
      active--;
      // Deferred so a replace() between two question screens does not re-lock after the new one unlocked.
      setTimeout(() => { if (active === 0) void lockPortrait(); }, 50);
    };
  }, []);
}
