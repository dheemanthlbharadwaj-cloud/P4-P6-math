// Typed wrappers for the Firebase callables (region asia-southeast1).
import { httpsCallable } from "firebase/functions";
import type {
  BootstrapProfileRequest, BootstrapProfileResponse, CallableName, ClaimQuestRequest, ClaimQuestResponse, DeleteAccountRequest,
  DeleteAccountResponse, GetLeaderboardRequest, MinigameResult, MinigameResultResponse,
  GetLeaderboardResponse, LevelResult, LevelResultResponse, PurchaseItemRequest, PurchaseItemResponse, RedeemReferralRequest,
  RedeemReferralResponse, RespondFriendRequestRequest, RespondFriendRequestResponse, RestoreProfileRequest, SendFriendRequestRequest,
  SendFriendRequestResponse,
} from "@p6/shared";
import { firebaseFunctions } from "./firebase";
import { currentUser } from "./auth";

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
  /** True when retrying later may succeed (offline, unavailable, unauthenticated-yet). */
  get transient() {
    return /unavailable|deadline|network|internal|unauthenticated|not-signed-in|resource-exhausted|unknown|cancelled/.test(this.code);
  }
}

async function call<Req, Res>(name: CallableName, data: Req): Promise<Res> {
  if (!currentUser()) throw new ApiError("not-signed-in", "Not signed in");
  try {
    const res = await httpsCallable<Req, Res>(firebaseFunctions(), name)(data);
    return res.data;
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "unknown";
    throw new ApiError(code.replace("functions/", ""), (e as Error)?.message ?? "Request failed");
  }
}

// Request/response types come from @p6/shared/src/api.ts (the backend implements exactly these).
export const api = {
  bootstrapProfile: (r: BootstrapProfileRequest | RestoreProfileRequest) => call<typeof r, BootstrapProfileResponse>("bootstrapProfile", r),
  submitLevelResult: (r: LevelResult) => call<LevelResult, LevelResultResponse>("submitLevelResult", r),
  submitMinigameResult: (r: MinigameResult) => call<MinigameResult, MinigameResultResponse>("submitMinigameResult", r),
  claimQuest: (r: ClaimQuestRequest) => call<ClaimQuestRequest, ClaimQuestResponse>("claimQuest", r),
  purchaseItem: (r: PurchaseItemRequest) => call<PurchaseItemRequest, PurchaseItemResponse>("purchaseItem", r),
  redeemReferral: (r: RedeemReferralRequest) => call<RedeemReferralRequest, RedeemReferralResponse>("redeemReferral", r),
  sendFriendRequest: (r: SendFriendRequestRequest) => call<SendFriendRequestRequest, SendFriendRequestResponse>("sendFriendRequest", r),
  respondFriendRequest: (r: RespondFriendRequestRequest) => call<RespondFriendRequestRequest, RespondFriendRequestResponse>("respondFriendRequest", r),
  getLeaderboard: (r: GetLeaderboardRequest) => call<GetLeaderboardRequest, GetLeaderboardResponse>("getLeaderboard", r),
  deleteAccount: () => call<DeleteAccountRequest, DeleteAccountResponse>("deleteAccount", {}),
};
