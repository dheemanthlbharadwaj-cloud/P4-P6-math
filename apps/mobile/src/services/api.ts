// Typed wrappers for the Firebase callables (region asia-southeast1).
import { httpsCallable } from "firebase/functions";
import type { LevelResult, LevelResultResponse } from "@p6/shared";
import { firebaseFunctions } from "./firebase";
import { currentUser } from "./auth";
import type * as T from "./apiTypes";

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
  /** True when retrying later may succeed (offline, unavailable, unauthenticated-yet). */
  get transient() {
    return /unavailable|deadline|network|internal|unauthenticated|not-signed-in|resource-exhausted/.test(this.code);
  }
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  if (!currentUser()) throw new ApiError("not-signed-in", "Not signed in");
  try {
    const res = await httpsCallable<Req, Res>(firebaseFunctions(), name)(data);
    return res.data;
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "unknown";
    throw new ApiError(code.replace("functions/", ""), (e as Error)?.message ?? "Request failed");
  }
}

export const api = {
  bootstrapProfile: (r: T.BootstrapProfileRequest) => call<T.BootstrapProfileRequest, T.BootstrapProfileResponse>("bootstrapProfile", r),
  submitLevelResult: (r: LevelResult) => call<LevelResult, LevelResultResponse>("submitLevelResult", r),
  purchaseItem: (r: T.PurchaseItemRequest) => call<T.PurchaseItemRequest, T.PurchaseItemResponse>("purchaseItem", r),
  redeemReferral: (r: T.RedeemReferralRequest) => call<T.RedeemReferralRequest, T.RedeemReferralResponse>("redeemReferral", r),
  sendFriendRequest: (r: T.SendFriendRequestRequest) => call<T.SendFriendRequestRequest, T.SendFriendRequestResponse>("sendFriendRequest", r),
  respondFriendRequest: (r: T.RespondFriendRequestRequest) => call<T.RespondFriendRequestRequest, T.RespondFriendRequestResponse>("respondFriendRequest", r),
  getLeaderboard: (r: T.GetLeaderboardRequest) => call<T.GetLeaderboardRequest, T.GetLeaderboardResponse>("getLeaderboard", r),
  deleteAccount: () => call<Record<string, never>, T.DeleteAccountResponse>("deleteAccount", {}),
};

/** PROPOSED callable (not in the frozen contract yet): persist the equipped look so friends see it. Best-effort. */
export const setCatLook = (look: { colorId: string; hatId: string | null }) =>
  call<typeof look, { ok: true }>("setCatLook", look);
