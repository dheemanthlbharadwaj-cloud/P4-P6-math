// Typed wrappers for the backend API (backend/netlify/handler.mjs): POST <backendUrl>/api/<name> with the Firebase ID
// token; errors carry the same codes as Firebase callables ("invalid-argument", "failed-precondition", ...).
import type {
  BootstrapProfileRequest, BootstrapProfileResponse, CallableName, ClaimQuestRequest, ClaimQuestResponse, DeleteAccountRequest,
  DeleteAccountResponse, GetLeaderboardRequest, MinigameResult, MinigameResultResponse,
  GetLeaderboardResponse, LevelResult, LevelResultResponse, PurchaseItemRequest, PurchaseItemResponse, RedeemReferralRequest,
  RedeemReferralResponse, RefreshPublicProfileResponse, RespondFriendRequestRequest, RespondFriendRequestResponse, RestoreProfileRequest, SendFriendRequestRequest,
  SendFriendRequestResponse,
} from "@p6/shared";
import { extra } from "./config";
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
  const user = currentUser();
  if (!user) throw new ApiError("not-signed-in", "Not signed in");
  if (!extra.backendUrl) throw new ApiError("unavailable", "Backend not configured");
  let res: Response;
  try {
    const token = await user.getIdToken();
    res = await fetch(`${extra.backendUrl}/api/${name}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
  } catch (e) {
    throw new ApiError("unavailable", (e as Error)?.message ?? "Network error");
  }
  const body = (await res.json().catch(() => null)) as { result?: Res; error?: { status?: string; message?: string } } | null;
  if (res.ok && body && "result" in body) return body.result as Res;
  throw new ApiError(body?.error?.status ?? (res.status >= 500 ? "unavailable" : "unknown"), body?.error?.message ?? `HTTP ${res.status}`);
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
  refreshPublicProfile: () => call<Record<string, never>, RefreshPublicProfileResponse>("refreshPublicProfile", {}),
  deleteAccount: () => call<DeleteAccountRequest, DeleteAccountResponse>("deleteAccount", {}),
};
