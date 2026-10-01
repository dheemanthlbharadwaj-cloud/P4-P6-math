// Callable (Cloud Functions) request/response contract. Single source of truth: the backend imports these
// via `backend/functions/scripts/copy-shared.mjs`, the app imports them from "@p6/shared".
// All callables live in region FUNCTIONS_REGION and require a signed-in user (else "unauthenticated").
//
// Error codes (HttpsError.code, without the "functions/" prefix the client SDK adds):
//   invalid-argument    malformed request
//   failed-precondition submitLevelResult: unknown content version / "completed" without 5 correct answers;
//                       purchaseItem: not enough stars
//   already-exists      purchaseItem: already owned; redeemReferral: already redeemed;
//                       sendFriendRequest: already friends / request already sent
//   not-found           purchaseItem: unknown item; redeemReferral / sendFriendRequest: unknown friend code;
//                       respondFriendRequest: unknown request
//   permission-denied   respondFriendRequest: not addressed to the caller
//
// NOT callables (the rules already protect them, see backend/firestore.rules): equipping a cat look, editing
// the profile and syncing progress / wrong bookmarks are direct owner writes to Firestore
// (users/{uid}.cat|fullName|school|topicsLearnt|psleDate, users/{uid}/progress/{grade}, users/{uid}/wrong/{id}).
// The rules refuse an equipped item that is not in wallets/{uid}.inventory ("color-black" is always owned), and
// the syncPublicProfile trigger mirrors users/{uid} into publicProfiles/{uid}.
import type { CatLook, Grade, LeaderboardEntry, PublicProfile, UserProfile } from "./types";

export const FUNCTIONS_REGION = "asia-southeast1";

export type CallableName =
  | "bootstrapProfile"
  | "submitLevelResult"
  | "purchaseItem"
  | "redeemReferral"
  | "sendFriendRequest"
  | "respondFriendRequest"
  | "getLeaderboard"
  | "deleteAccount";

/** Server-owned account state: everything needed to restore a device (stars, inventory, look, entitlement). */
export interface AccountState {
  starBalance: number;
  monthlyStars: number; // this SGT month
  ownedItems: string[]; // inventory item ids ("color-black" always included)
  equipped: CatLook;
  subscribed: boolean; // RevenueCat "unlimited" entitlement is active right now
}

// ---- bootstrapProfile ----
export interface BootstrapProfileRequest {
  fullName: string;
  school: string;
  grade: Grade;
  topicsLearnt: string[];
  psleDate: string; // yyyy-mm-dd or ""
  catName: string;
}
/** Sign-in on a new device: only look the account up, never create it. */
export interface RestoreProfileRequest {
  restoreOnly: true;
}
export interface BootstrapProfileResponse extends AccountState {
  /** null only for a restoreOnly request when the account has no profile yet. */
  profile: UserProfile | null;
  created: boolean;
}

// ---- submitLevelResult (request/response are LevelResult / LevelResultResponse in types.ts) ----

// ---- purchaseItem ----
export interface PurchaseItemRequest {
  itemId: string;
}
export interface PurchaseItemResponse {
  starBalance: number;
  ownedItems: string[];
}

// ---- redeemReferral: the CALLER (referred user) enters the referrer's friend code; the REFERRER gets the stars ----
export interface RedeemReferralRequest {
  friendCode: string;
}
export interface RedeemReferralResponse {
  starsAwarded: number; // paid to the referrer, not to the caller
}

// ---- friends ----
export interface SendFriendRequestRequest {
  friendCode: string;
}
/** "accepted" when the other side had already asked us (we become friends at once). */
export interface SendFriendRequestResponse {
  status: "pending" | "accepted";
}
export interface RespondFriendRequestRequest {
  requestId: string;
  accept: boolean;
}
export interface RespondFriendRequestResponse {
  status: "accepted" | "declined";
}

// ---- getLeaderboard ----
export type LeaderboardScope = "daily" | "monthly";
export interface GetLeaderboardRequest {
  scope: LeaderboardScope;
}
export interface GetLeaderboardResponse {
  scope: LeaderboardScope;
  /** daily → SGT date yyyy-mm-dd; monthly → SGT month yyyy-mm */
  periodKey: string;
  selfUid: string;
  friendUids: string[];
  /** public profiles of the caller's friends (map avatars + names); never includes the caller */
  friends: PublicProfile[];
  /** daily: caller + friends; monthly: global top 100 (+ the caller when outside it). Sorted by rank. */
  entries: LeaderboardEntry[];
}

// ---- deleteAccount ----
export type DeleteAccountRequest = Record<string, never>;
export interface DeleteAccountResponse {
  deleted: true;
}
