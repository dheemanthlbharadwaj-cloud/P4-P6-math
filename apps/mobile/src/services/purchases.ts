// RevenueCat stub. Entitlement id "unlimited". Works without keys (returns "unavailable").
import { Platform } from "react-native";
import { SUBSCRIPTION_ENTITLEMENT, SUBSCRIPTION_PRICE_LABEL } from "@p6/shared";
import { extra } from "./config";
import { usePlayer } from "../store/player";

type PurchasesModule = typeof import("react-native-purchases");
let mod: PurchasesModule | null | undefined;
let configured = false;

function rc(): PurchasesModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS === "web") return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("react-native-purchases") as PurchasesModule;
  } catch {
    mod = null;
  }
  return mod;
}

export async function initPurchases(uid: string | null): Promise<boolean> {
  const m = rc();
  const apiKey = Platform.OS === "ios" ? extra.revenueCat?.ios : extra.revenueCat?.android;
  if (!m || !apiKey) return false; // TODO(owner): EXPO_PUBLIC_REVENUECAT_*_KEY
  try {
    if (!configured) {
      m.default.configure({ apiKey, appUserID: uid ?? undefined });
      configured = true;
    } else if (uid) {
      await m.default.logIn(uid);
    }
    const info = await m.default.getCustomerInfo();
    usePlayer.getState().setSubscribed(!!info.entitlements.active[SUBSCRIPTION_ENTITLEMENT]);
    return true;
  } catch (e) {
    console.warn("RevenueCat init failed", e);
    return false;
  }
}

export interface PaywallInfo {
  priceLabel: string;
  available: boolean;
}

export async function loadPaywall(): Promise<PaywallInfo> {
  const m = rc();
  if (!m || !configured) return { priceLabel: SUBSCRIPTION_PRICE_LABEL, available: false };
  try {
    const offerings = await m.default.getOfferings();
    const pkg = offerings.current?.monthly ?? offerings.current?.availablePackages[0];
    return { priceLabel: pkg ? `${pkg.product.priceString}/month` : SUBSCRIPTION_PRICE_LABEL, available: !!pkg };
  } catch {
    return { priceLabel: SUBSCRIPTION_PRICE_LABEL, available: false };
  }
}

export async function purchaseSubscription(): Promise<"ok" | "cancelled" | "unavailable"> {
  const m = rc();
  if (!m || !configured) return "unavailable";
  try {
    const offerings = await m.default.getOfferings();
    const pkg = offerings.current?.monthly ?? offerings.current?.availablePackages[0];
    if (!pkg) return "unavailable";
    const { customerInfo } = await m.default.purchasePackage(pkg);
    const active = !!customerInfo.entitlements.active[SUBSCRIPTION_ENTITLEMENT];
    usePlayer.getState().setSubscribed(active);
    return active ? "ok" : "unavailable";
  } catch (e) {
    return (e as { userCancelled?: boolean })?.userCancelled ? "cancelled" : "unavailable";
  }
}

export async function restorePurchases(): Promise<boolean> {
  const m = rc();
  if (!m || !configured) return false;
  try {
    const info = await m.default.restorePurchases();
    const active = !!info.entitlements.active[SUBSCRIPTION_ENTITLEMENT];
    usePlayer.getState().setSubscribed(active);
    return active;
  } catch {
    return false;
  }
}
