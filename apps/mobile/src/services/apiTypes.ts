// Request/response shapes of the backend callables. Defined here because packages/shared only has
// LevelResult/LevelResultResponse today; proposed for promotion to shared (see final report).
import type { CatLook, Grade, LeaderboardEntry, LevelResult, LevelResultResponse, PublicProfile, UserProfile } from "@p6/shared";

export type { LevelResult, LevelResultResponse };

export interface BootstrapProfileRequest {
  fullName: string;
  school: string;
  grade: Grade;
  topicsLearnt: string[];
  psleDate: string;
  catName: string;
  referralCode?: string;
}
export interface BootstrapProfileResponse {
  profile: UserProfile;
  starBalance: number;
  monthlyStars: number;
  ownedItems: string[];
  equipped: CatLook;
  subscribed: boolean;
}

export interface PurchaseItemRequest { itemId: string }
export interface PurchaseItemResponse { starBalance: number; ownedItems: string[] }

export interface RedeemReferralRequest { code: string }
export interface RedeemReferralResponse { starsAwarded: number; starBalance: number }

export interface SendFriendRequestRequest { friendCode: string }
export interface SendFriendRequestResponse { requestId: string; status: "sent" | "already-friends" | "accepted" }

export interface RespondFriendRequestRequest { requestId: string; accept: boolean }
export interface RespondFriendRequestResponse { ok: true }

export type LeaderboardScope = "daily" | "monthly";
export interface GetLeaderboardRequest { scope: LeaderboardScope; grade: Grade }
export interface GetLeaderboardResponse {
  entries: LeaderboardEntry[];
  selfUid: string;
  friendUids: string[];
  /** For scope=daily the friends' public profiles (map avatars + names). */
  friends?: PublicProfile[];
  periodKey: string; // yyyy-mm-dd or yyyy-mm
}

export type DeleteAccountResponse = { deleted: true };
