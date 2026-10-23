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
import type { MarkValue } from "@p6/shared";
import type { MyClassroom } from "../logic/classroom";
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

// Classroom (student side). Contract: packages/shared/src/classroom.ts ("Student callables").
export const getMyClassroom = () => call<Record<string, never>, MyClassroom>("getMyClassroom", {});
export const submitTaskAnswers = (r: { classId: string; taskId: string; answers: { questionId: string; responses: string[] }[] }) =>
  call<typeof r, { marks: Record<string, MarkValue> }>("submitTaskAnswers", r);

// Teacher dashboard (web). Contract: packages/shared/src/classroom.ts ("Callables"); used through src/teacher/client.ts.
import type {
  AnalyticsReq, CreateTaskReq, ListPostsReq, MarkTaskReq, PostReq, SaveClassReq, TeacherDashboard,
} from "../teacher/types";
import type { UploadSignature } from "../teacher/helpers";
import type { ClassAnalytics, ClassPost as TClassPost, ClassStudent, ClassTask as TClassTask, StudentAnalytics, TaskMarks } from "@p6/shared";
export const teacherApi = {
  getDashboard: () => call<Record<string, never>, TeacherDashboard>("teacherGetDashboard", {}),
  saveClass: (r: SaveClassReq) => call<SaveClassReq, { classId: string }>("teacherSaveClass", r),
  deleteClass: (classId: string) => call<{ classId: string }, { ok: true }>("teacherDeleteClass", { classId }),
  addStudent: (classId: string, friendCode: string) => call<{ classId: string; friendCode: string }, { student: ClassStudent }>("teacherAddStudent", { classId, friendCode }),
  removeStudent: (classId: string, studentUid: string) => call<{ classId: string; studentUid: string }, { ok: true }>("teacherRemoveStudent", { classId, studentUid }),
  setBirthday: (classId: string, studentUid: string, birthday: string | null) => call<{ classId: string; studentUid: string; birthday: string | null }, { ok: true }>("teacherSetBirthday", { classId, studentUid, birthday }),
  post: (r: PostReq) => call<PostReq, { post: TClassPost }>("teacherPost", r),
  deletePost: (classId: string, postId: string) => call<{ classId: string; postId: string }, { ok: true }>("teacherDeletePost", { classId, postId }),
  /** Proposed, not in CallableName yet: the backend answers "not-found"/"unknown" until it exists. */
  listPosts: (r: ListPostsReq) => call<ListPostsReq, { posts: TClassPost[] }>("teacherListPosts", r),
  uploadSignature: (classId: string, fileName: string) => call<{ classId: string; fileName: string }, UploadSignature>("teacherUploadSignature", { classId, fileName }),
  createTask: (r: CreateTaskReq) => call<CreateTaskReq, { task: TClassTask }>("teacherCreateTask", r),
  listTasks: (classId: string) => call<{ classId: string }, { tasks: TClassTask[] }>("teacherListTasks", { classId }),
  getTaskMarks: (classId: string, taskId: string) => call<{ classId: string; taskId: string }, { marks: TaskMarks[] }>("teacherGetTaskMarks", { classId, taskId }),
  markTask: (r: MarkTaskReq) => call<MarkTaskReq, { starsAwarded: number }>("teacherMarkTask", r),
  getAnalytics: (r: AnalyticsReq) => call<AnalyticsReq, { class: ClassAnalytics; student?: StudentAnalytics }>("teacherGetAnalytics", r),
};

// Admin (owner) dashboard (web). Contract: packages/shared/src/admin.ts ("Callables"); used through src/admin/client.ts.
import type { AdminOverview, SaveAdminClassReq } from "../admin/types";
import type { AdminUserRow, TeacherDoc } from "@p6/shared";
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
