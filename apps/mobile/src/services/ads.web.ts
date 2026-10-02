// Web build of the ads service: AdMob has no web SDK and its package imports React Native internals that do not
// exist on web, so Metro picks this file instead of ads.ts for web. Same API, mock reward.
import { DEV_TOOLS, useDev } from "../dev/devTools";

export interface AdResult {
  rewarded: boolean;
  reason?: "unavailable" | "load-failed" | "dismissed";
  mocked?: boolean;
}

export const adsAvailable = () => false;

export async function initAds(): Promise<void> {}

export async function showRewardedAd(): Promise<AdResult> {
  await new Promise((r) => setTimeout(r, 800));
  // Dev Tools can make the mock ad fail or be closed early, to test those paths.
  const outcome = DEV_TOOLS ? useDev.getState().adOutcome : "rewarded";
  if (outcome !== "rewarded") return { rewarded: false, reason: outcome, mocked: true };
  return { rewarded: true, mocked: true };
}
