// On phones the app is portrait-only except question screens (level / minigame / practice), which may rotate so the
// scratchpad can sit beside the question. Tablets turn freely everywhere (their layouts fit both ways, see
// theme/layout.ts). Screens call this hook; the root layout locks portrait at start.
import { useEffect } from "react";
import { Dimensions } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

/** A phone (shorter side under 600pt) rather than a tablet. */
const isPhone = () => { const { width, height } = Dimensions.get("screen"); return Math.min(width, height) < 600; };

export async function lockPortrait() {
  if (!isPhone()) return;
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
