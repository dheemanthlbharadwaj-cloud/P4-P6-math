// Typed wrappers for the backend API (backend/netlify/handler.mjs): POST <backendUrl>/api/<name> with the Firebase ID
// token; errors carry the same codes as Firebase callables ("invalid-argument", "failed-precondition", ...).
import type {
  BootstrapProfileRequest, BootstrapProfileResponse, CallableName, ClaimQuestRequest, ClaimQuestResponse, DeleteAccountRequest,
  DeleteAccountResponse, GetLeaderboardRequest, MinigameResult, MinigameResultResponse,
  GetLeaderboardResponse, LevelResult, LevelResultResponse, PurchaseItemRequest, PurchaseItemResponse, RedeemReferralRequest,
  RedeemReferralResponse, RefreshPublicProfileResponse, ReportQuestionRequest, ReportQuestionResponse, RespondFriendRequestRequest,
  ListFriendRequestsResponse, SyncProgressRequest, SyncProgressResponse, UpdateProfileRequest, UpdateProfileResponse, RespondFriendRequestResponse, RestoreProfileRequest, SendFriendRequestRequest,
  SendFriendRequestResponse, GetDailyQuestsRequest, GetDailyQuestsResponse, GetQuestionPatchesRequest, GetQuestionPatchesResponse, ClaimDailyQuestRequest, ClaimDailyQuestResponse,
} from "@p6/shared";
import type { Child, Family, Lesson, LessonReport, LessonSession, MyRoles, ParentHome, SessionChildInput } from "@p6/shared";
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
  updateProfile: (r: UpdateProfileRequest) => call<UpdateProfileRequest, UpdateProfileResponse>("updateProfile", r),
  syncProgress: (r: SyncProgressRequest) => call<SyncProgressRequest, SyncProgressResponse>("syncProgress", r),
  listFriendRequests: () => call<Record<string, never>, ListFriendRequestsResponse>("listFriendRequests", {}),
  reportQuestion: (r: ReportQuestionRequest) => call<ReportQuestionRequest, ReportQuestionResponse>("reportQuestion", r),
  refreshPublicProfile: () => call<Record<string, never>, RefreshPublicProfileResponse>("refreshPublicProfile", {}),
  getDailyQuests: () => call<GetDailyQuestsRequest, GetDailyQuestsResponse>("getDailyQuests", {}),
  claimDailyQuest: (r: ClaimDailyQuestRequest) => call<ClaimDailyQuestRequest, ClaimDailyQuestResponse>("claimDailyQuest", r),
  getQuestionPatches: (r: GetQuestionPatchesRequest) => call<GetQuestionPatchesRequest, GetQuestionPatchesResponse>("getQuestionPatches", r),
  deleteAccount: () => call<DeleteAccountRequest, DeleteAccountResponse>("deleteAccount", {}),
};

/** Calls that work signed out (only parentSignIn). */
async function callPublic<Req, Res>(name: CallableName, data: Req): Promise<Res> {
  if (!extra.backendUrl) throw new ApiError("unavailable", "Backend not configured");
  let res: Response;
  try {
    res = await fetch(`${extra.backendUrl}/api/${name}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
  } catch (e) {
    throw new ApiError("unavailable", (e as Error)?.message ?? "Network error");
  }
  const body = (await res.json().catch(() => null)) as { result?: Res; error?: { status?: string; message?: string } } | null;
  if (res.ok && body && "result" in body) return body.result as Res;
  throw new ApiError(body?.error?.status ?? (res.status >= 500 ? "unavailable" : "unknown"), body?.error?.message ?? `HTTP ${res.status}`);
}

/** Which areas this login may open (teacher / admin). Live from the 7 Nov backend deploy. */
export const getMyRoles = () => call<Record<string, never>, MyRoles>("getMyRoles", {});

// Catapult Classroom: lessons, students, parents. Contract: packages/shared/src/lessons.ts.
export interface StudentsList { families: Family[]; children: Child[]; teachers?: { uid: string; name: string }[] }
export interface SaveFamilyReq { id?: string; parentName: string; teacherUid?: string; children: { id?: string; name: string; level: string }[] }
export type SaveLessonReq = Partial<Pick<Lesson, "id">> & Pick<Lesson, "title" | "subject" | "level" | "intro" | "goals" | "parts">;
export interface SaveSessionReq { id?: string; lessonId: string; date: number; reports: SessionChildInput[]; familyTexts: Record<string, string> }
export const lessonsApi = {
  getStudents: () => call<Record<string, never>, StudentsList>("teacherGetStudents", {}),
  saveFamily: (r: SaveFamilyReq) => call<SaveFamilyReq, { family: Family; children: Child[]; code?: string }>("teacherSaveFamily", r),
  resetFamilyCode: (familyId: string) => call<{ familyId: string }, { code: string }>("teacherResetFamilyCode", { familyId }),
  deleteFamily: (familyId: string) => call<{ familyId: string }, { ok: true }>("teacherDeleteFamily", { familyId }),
  getChild: (childId: string) => call<{ childId: string }, { child: Child; family: Family; reports: LessonReport[] }>("teacherGetChild", { childId }),
  listLessons: () => call<Record<string, never>, { lessons: Lesson[] }>("teacherListLessons", {}),
  saveLesson: (r: SaveLessonReq) => call<SaveLessonReq, { lesson: Lesson }>("teacherSaveLesson", r),
  deleteLesson: (lessonId: string) => call<{ lessonId: string }, { ok: true }>("teacherDeleteLesson", { lessonId }),
  saveSession: (r: SaveSessionReq) => call<SaveSessionReq, { session: LessonSession; reports: LessonReport[] }>("teacherSaveSession", r),
  parentSignIn: (code: string) => callPublic<{ code: string }, { token: string }>("parentSignIn", { code }),
  parentGetHome: () => call<Record<string, never>, ParentHome>("parentGetHome", {}),
};

// Admin (owner) dashboard (web). Contract: packages/shared/src/admin.ts ("Callables"); used through src/admin/client.ts.
import type { AdminOverview, SaveAdminClassReq } from "../admin/types";
import type { AdminUserRow, ClassStudent, TeacherDoc } from "@p6/shared";
export const adminApi = {
  getOverview: () => call<Record<string, never>, AdminOverview>("adminGetOverview", {}),
  saveTeacher: (email: string, name: string, uid?: string) => call<{ uid?: string; email: string; name: string }, { teacher: TeacherDoc; password?: string }>("adminSaveTeacher", { ...(uid ? { uid } : {}), email, name }),
  setTeacherActive: (uid: string, active: boolean) => call<{ uid: string; active: boolean }, { ok: true }>("adminSetTeacherActive", { uid, active }),
  resetPassword: (uid: string) => call<{ uid: string }, { password: string }>("adminResetPassword", { uid }),
  findUser: (query: string) => call<{ query: string }, { users: AdminUserRow[] }>("adminFindUser", { query }),
  setUserDisabled: (uid: string, disabled: boolean) => call<{ uid: string; disabled: boolean }, { ok: true }>("adminSetUserDisabled", { uid, disabled }),
  saveClass: (r: SaveAdminClassReq) => call<SaveAdminClassReq, { classId: string }>("adminSaveClass", r),
  deleteClass: (classId: string) => call<{ classId: string }, { ok: true }>("adminDeleteClass", { classId }),
  addStudent: (classId: string, friendCode: string) => call<{ classId: string; friendCode: string }, { student: ClassStudent }>("adminAddStudent", { classId, friendCode }),
  removeStudent: (classId: string, studentUid: string) => call<{ classId: string; studentUid: string }, { ok: true }>("adminRemoveStudent", { classId, studentUid }),
};
