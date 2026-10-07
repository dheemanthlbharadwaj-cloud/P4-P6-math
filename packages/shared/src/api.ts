// Callable (Cloud Functions) request/response contract. Single source of truth: the backend imports these
// via `backend/functions/scripts/copy-shared.mjs`, the app imports them from "@p6/shared".
// All callables live in region FUNCTIONS_REGION and require a signed-in user (else "unauthenticated").
//
// Error codes (HttpsError.code, without the "functions/" prefix the client SDK adds):
//   invalid-argument    malformed request
//   failed-precondition submitLevelResult: unknown content version / "completed" without 5 correct answers;
//                       purchaseItem: not enough stars; claimQuest: not enough lifetime stars
//   already-exists      purchaseItem: already owned; claimQuest: already claimed; redeemReferral: already redeemed;
//                       sendFriendRequest: already friends / request already sent
//   not-found           purchaseItem: unknown item; claimQuest: unknown quest; redeemReferral / sendFriendRequest: unknown friend code;
//                       respondFriendRequest: unknown request
//   permission-denied   respondFriendRequest: not addressed to the caller
//
// NOT callables (the rules already protect them, see backend/firestore.rules): equipping a cat look, editing
// the profile and syncing progress / wrong bookmarks are direct owner writes to Firestore
// (users/{uid}.cat|fullName|school|topicsLearnt|psleDate, users/{uid}/progress/{grade}, users/{uid}/wrong/{id}).
// The rules refuse an equipped item that is not in wallets/{uid}.inventory ("color-black" is always owned), and
// the syncPublicProfile trigger mirrors users/{uid} into publicProfiles/{uid}.
import type { CatLook, Grade, GradeProgress, LeaderboardEntry, PublicProfile, UserProfile } from "./types";

export const FUNCTIONS_REGION = "asia-southeast1";

export type CallableName =
  | "bootstrapProfile"
  | "submitLevelResult"
  | "submitMinigameResult"
  | "claimQuest"
  | "purchaseItem"
  | "redeemReferral"
  | "sendFriendRequest"
  | "respondFriendRequest"
  | "getLeaderboard"
  | "refreshPublicProfile"
  | "reportQuestion"
  | "updateProfile"
  | "syncProgress"
  | "listFriendRequests"
  | "deleteAccount";

/** Server-owned account state: everything needed to restore a device (stars, inventory, look, entitlement). */
export interface AccountState {
  starBalance: number;
  monthlyStars: number; // this SGT month
  totalStars: number; // lifetime stars earned (quests)
  claimedQuests: string[]; // quest ids
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

// ---- submitMinigameResult: one round of a mini game; +1 star per question answered right that the student had
//      never attempted before (levels or mini games), see stars.ts. Idempotent per attemptId. ----
export interface MinigameResult {
  attemptId: string;
  grade: Grade;
  mode: "challenge" | "mistakes" | "all-wrong";
  answers: { questionId: string; correct: boolean }[]; // in the order answered
  finishedAt: number;
}
export interface MinigameResultResponse {
  starsAwarded: number;
  starBalance: number;
  monthlyStars: number;
  totalStars: number;
  duplicate: boolean;
}

// ---- claimQuest: lifetime stars ≥ quest.stars → the reward goes into the inventory ----
export interface ClaimQuestRequest {
  questId: string;
}
export interface ClaimQuestResponse {
  ownedItems: string[];
  claimedQuests: string[];
}

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
/** friends: the caller + friends; school: everyone at the caller's school; global: top 100 (+ the caller). */
export type LeaderboardScope = "friends" | "school" | "global";
export interface GetLeaderboardRequest {
  scope: LeaderboardScope;
}
export interface GetLeaderboardResponse {
  scope: LeaderboardScope;
  /** SGT month yyyy-mm (ranking = stars earned this month) */
  periodKey: string;
  selfUid: string;
  friendUids: string[];
  /** public profiles of the caller's friends (map avatars + names); never includes the caller */
  friends: PublicProfile[];
  /** friends: caller + friends; school: the caller's school (top 200); global: top 100 (+ the caller when outside
   *  either list). Sorted by rank. */
  entries: LeaderboardEntry[];
}

// ---- deleteAccount ----
export type DeleteAccountRequest = Record<string, never>;
export interface DeleteAccountResponse {
  deleted: true;
}

// ---- reportQuestion: a student flags a problem with a question. Stored in question_reports/{questionId}__{uid} in
//      the question bank's database, where the editor shows it on the question (one open report per student per
//      question; reporting again updates it). At most MAX_REPORTS_PER_DAY per student per Singapore day. ----
export const REPORT_REASONS = [
  { id: "wrong-answer", label: "The answer is wrong" },
  { id: "marked-wrong", label: "My answer was right but marked wrong" },
  { id: "unclear", label: "The question is unclear or has a typo" },
  { id: "figure", label: "The picture is missing or wrong" },
  { id: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["id"];
export const MAX_REPORTS_PER_DAY = 20;
export const MAX_REPORT_NOTE = 500;
export interface ReportQuestionRequest {
  questionId: string;
  grade: Grade;
  reason: ReportReason;
  note?: string;
  /** Where the student saw it. */
  context: "level" | "minigame" | "practice";
  /** The student's answer, when they had given one (helps with "marked wrong" reports). */
  answerGiven?: string;
  contentVersion?: string;
}
export interface ReportQuestionResponse {
  reportId: string;
  /** true when this student had reported the question before (the report was updated and reopened). */
  updated: boolean;
}

// ---- Device data goes through the backend only (no client access to Firestore), so the student app never depends
//      on the security rules of the database it shares with the question bank editor. ----

// updateProfile: the editable profile fields + equipped cat look (items must be owned: free or in the inventory;
// an unowned look is skipped and the rest saved). Also refreshes publicProfiles/{uid}.
export interface UpdateProfileRequest {
  fullName: string;
  school: string;
  topicsLearnt: string[];
  psleDate: string; // "" or yyyy-mm-dd
  cat: UserProfile["cat"];
}
export interface UpdateProfileResponse {
  /** false when the look was not saved (an item the account does not own). */
  catApplied: boolean;
}

// syncProgress: merge this device's map progress into the server copy (by max: sticky completion, best score, union
// of topics) and/or store changed "previously wrong" bookmarks; returns the merged progress (and with `pull`, every
// bookmark for the grade).
export const MAX_SYNC_WRONG = 400;
export interface WrongBookmark {
  id: string; // question id
  active: boolean; // currently flagged (false = answered right later, kept for "all wrong ever")
  flaggedAt: number;
}
export interface SyncProgressRequest {
  grade: Grade;
  progress?: Pick<GradeProgress, "unlockedTopics" | "levels">;
  wrong?: WrongBookmark[]; // at most MAX_SYNC_WRONG per call
  pull?: boolean;
}
export interface SyncProgressResponse {
  progress: GradeProgress | null;
  wrong?: WrongBookmark[]; // only with pull
}

// listFriendRequests: pending requests addressed to the caller.
export interface ListFriendRequestsResponse {
  requests: { id: string; fromUid: string; displayName: string }[];
}

// ---- refreshPublicProfile: copy users/{uid} to publicProfiles/{uid} after the app writes its profile ----
export interface RefreshPublicProfileResponse {
  ok: boolean;
}
