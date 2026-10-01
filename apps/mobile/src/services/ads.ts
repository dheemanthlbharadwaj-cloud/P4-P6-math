// Rewarded ads (child-directed). The native module is optional: in Expo Go / web / tests it is absent and we
// fall back to a mock reward so the app and screens keep working.
import { Platform } from "react-native";
import { extra } from "./config";

type AdsModule = typeof import("react-native-google-mobile-ads");
let mod: AdsModule | null | undefined;
let initialised = false;

function ads(): AdsModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === "web") return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("react-native-google-mobile-ads") as AdsModule;
  } catch {
    mod = null;
  }
  return mod;
}

export const adsAvailable = () => ads() !== null;

export async function initAds(): Promise<void> {
  const m = ads();
  if (!m || initialised) return;
  initialised = true;
  try {
    await m.default().setRequestConfiguration({
      tagForChildDirectedTreatment: true,
      tagForUnderAgeOfConsent: true,
      maxAdContentRating: m.MaxAdContentRating.G,
    });
    await m.default().initialize();
  } catch (e) {
    console.warn("Ads init failed", e);
  }
}

function unitId(m: AdsModule): string {
  if (__DEV__) return m.TestIds.REWARDED;
  const id = Platform.OS === "ios" ? extra.admob?.rewardedIos : extra.admob?.rewardedAndroid;
  if (!id) {
    console.warn("TODO(owner): set EXPO_PUBLIC_ADMOB_REWARDED_* — using Google test ad unit");
    return m.TestIds.REWARDED;
  }
  return id;
}

export interface AdResult {
  rewarded: boolean;
  reason?: "unavailable" | "load-failed" | "dismissed";
  mocked?: boolean;
}

/** Load and show one rewarded ad. Resolves once the ad is closed. Never throws. */
export async function showRewardedAd(): Promise<AdResult> {
  const m = ads();
  if (!m) {
    await new Promise((r) => setTimeout(r, 800));
    return { rewarded: true, mocked: true };
  }
  await initAds();
  return new Promise<AdResult>((resolve) => {
    let earned = false;
    let settled = false;
    const done = (r: AdResult) => {
      if (settled) return;
      settled = true;
      unsubs.forEach((u) => u());
      resolve(r);
    };
    const ad = m.RewardedAd.createForAdRequest(unitId(m), { requestNonPersonalizedAdsOnly: true });
    const unsubs = [
      ad.addAdEventListener(m.RewardedAdEventType.LOADED, () => {
        ad.show().catch(() => done({ rewarded: false, reason: "load-failed" }));
      }),
      ad.addAdEventListener(m.RewardedAdEventType.EARNED_REWARD, () => {
        earned = true;
      }),
      ad.addAdEventListener(m.AdEventType.CLOSED, () => done(earned ? { rewarded: true } : { rewarded: false, reason: "dismissed" })),
      ad.addAdEventListener(m.AdEventType.ERROR, () => done({ rewarded: false, reason: "load-failed" })),
    ];
    ad.load();
    setTimeout(() => done({ rewarded: false, reason: "load-failed" }), 20_000);
  });
}
