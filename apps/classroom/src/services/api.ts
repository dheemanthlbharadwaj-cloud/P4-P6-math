// Typed wrappers for the Catapult Classroom backend (backend-classroom/, its own Netlify site and Firebase project):
// POST <backendUrl>/api/<name> with the Firebase ID token; errors carry callable codes ("invalid-argument", …).
// Contract: packages/shared/src/lessons.ts (ClassroomCallable).
import type { Child, ClassroomCallable, Family, Lesson, LessonReport, LessonSession, MyRoles, ParentHome, SessionChildInput, TeacherDoc } from "@p6/shared";
import { extra } from "./config";
import { currentUser } from "./auth";

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
  get transient() {
    return /unavailable|deadline|network|internal|unauthenticated|not-signed-in|resource-exhausted|unknown|cancelled/.test(this.code);
  }
}

async function post<Res>(name: ClassroomCallable, data: unknown, token?: string): Promise<Res> {
  if (!extra.backendUrl) throw new ApiError("unavailable", "Backend not configured");
  let res: Response;
  try {
    res = await fetch(`${extra.backendUrl}/api/${name}`, {
      method: "POST",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    });
  } catch (e) {
    throw new ApiError("unavailable", (e as Error)?.message ?? "Network error");
  }
  const body = (await res.json().catch(() => null)) as { result?: Res; error?: { status?: string; message?: string } } | null;
  if (res.ok && body && "result" in body) return body.result as Res;
  throw new ApiError(body?.error?.status ?? (res.status >= 500 ? "unavailable" : "unknown"), body?.error?.message ?? `HTTP ${res.status}`);
}
async function call<Res>(name: ClassroomCallable, data: unknown = {}): Promise<Res> {
  const user = currentUser();
  if (!user) throw new ApiError("not-signed-in", "Not signed in");
  return post<Res>(name, data, await user.getIdToken());
}

/** Which staff areas this login may open. */
export const getMyRoles = () => call<MyRoles>("getMyRoles");

export interface StudentsList { families: Family[]; children: Child[]; teachers?: { uid: string; name: string }[] }
export interface SaveFamilyReq { id?: string; parentName: string; teacherUid?: string; children: { id?: string; name: string; level: string }[] }
export type SaveLessonReq = Partial<Pick<Lesson, "id">> & Pick<Lesson, "title" | "subject" | "level" | "intro" | "goals" | "parts">;
export interface SaveSessionReq { id?: string; lessonId: string; date: number; reports: SessionChildInput[]; familyTexts: Record<string, string> }
export const lessonsApi = {
  getStudents: () => call<StudentsList>("teacherGetStudents"),
  saveFamily: (r: SaveFamilyReq) => call<{ family: Family; children: Child[]; code?: string }>("teacherSaveFamily", r),
  resetFamilyCode: (familyId: string) => call<{ code: string }>("teacherResetFamilyCode", { familyId }),
  deleteFamily: (familyId: string) => call<{ ok: true }>("teacherDeleteFamily", { familyId }),
  getChild: (childId: string) => call<{ child: Child; family: Family; reports: LessonReport[] }>("teacherGetChild", { childId }),
  listLessons: () => call<{ lessons: Lesson[] }>("teacherListLessons"),
  saveLesson: (r: SaveLessonReq) => call<{ lesson: Lesson }>("teacherSaveLesson", r),
  deleteLesson: (lessonId: string) => call<{ ok: true }>("teacherDeleteLesson", { lessonId }),
  saveSession: (r: SaveSessionReq) => call<{ session: LessonSession; reports: LessonReport[] }>("teacherSaveSession", r),
  /** Signed out: the family code → a custom token. */
  parentSignIn: (code: string) => post<{ token: string }>("parentSignIn", { code }),
  parentGetHome: () => call<ParentHome>("parentGetHome"),
};

export const adminApi = {
  getOverview: () => call<{ admin: TeacherDoc; teachers: TeacherDoc[] }>("adminGetOverview"),
  saveTeacher: (email: string, name: string, uid?: string) => call<{ teacher: TeacherDoc; password?: string }>("adminSaveTeacher", { ...(uid ? { uid } : {}), email, name }),
  setTeacherActive: (uid: string, active: boolean) => call<{ ok: true }>("adminSetTeacherActive", { uid, active }),
  resetPassword: (uid: string) => call<{ password: string }>("adminResetPassword", { uid }),
};
