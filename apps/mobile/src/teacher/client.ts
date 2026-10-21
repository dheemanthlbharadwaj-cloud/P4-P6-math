// The dashboard's backend: the real teacher callables (services/api.ts), or the dev mock when the page is opened with
// ?mock=1 (or EXPO_PUBLIC_TEACHER_MOCK=1). The flag is read once at load (in-app navigation drops the query string),
// and mockQuery() carries it into links that open in a new tab (the print view).
import { ApiError, teacherApi } from "../services/api";
import { cloudinaryUploadUrl, uploadFields, type UploadSignature } from "./helpers";
import type { TeacherBackend } from "./types";
import { mockBackend } from "./mock";

function readMock(): boolean {
  let v: string | null | undefined = process.env.EXPO_PUBLIC_TEACHER_MOCK;
  try {
    if (typeof window !== "undefined" && window.location?.search) v = new URLSearchParams(window.location.search).get("mock") ?? v;
  } catch { /* no window */ }
  return !!v && v !== "0";
}
export const TEACHER_MOCK = readMock();
export const mockQuery = (): string => (TEACHER_MOCK ? "?mock=1" : "");

async function uploadToCloudinary(sig: UploadSignature, file: File): Promise<string> {
  const form = new FormData();
  for (const [k, v] of Object.entries(uploadFields(sig))) form.append(k, v);
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(cloudinaryUploadUrl(sig.cloudName), { method: "POST", body: form });
  } catch (e) {
    throw new ApiError("unavailable", (e as Error)?.message ?? "Upload failed (no connection)");
  }
  const body = (await res.json().catch(() => null)) as { secure_url?: string; error?: { message?: string } } | null;
  if (!res.ok || !body?.secure_url) throw new ApiError("unknown", body?.error?.message ?? `Upload failed (HTTP ${res.status})`);
  return body.secure_url;
}

const realBackend: TeacherBackend = {
  getDashboard: () => teacherApi.getDashboard(),
  saveClass: (r) => teacherApi.saveClass(r),
  deleteClass: async (classId) => { await teacherApi.deleteClass(classId); },
  addStudent: async (classId, code) => (await teacherApi.addStudent(classId, code)).student,
  removeStudent: async (classId, uid) => { await teacherApi.removeStudent(classId, uid); },
  setBirthday: async (classId, uid, b) => { await teacherApi.setBirthday(classId, uid, b); },
  post: async (r) => (await teacherApi.post(r)).post,
  deletePost: async (classId, postId) => { await teacherApi.deletePost(classId, postId); },
  listPosts: async (r) => {
    try {
      return (await teacherApi.listPosts(r)).posts;
    } catch (e) {
      // Not deployed yet (the contract has no post listing): the dashboard falls back to this session's posts.
      if (e instanceof ApiError && /not-found|unknown|unimplemented|invalid-argument/.test(e.code)) return null;
      throw e;
    }
  },
  uploadSignature: (classId, fileName) => teacherApi.uploadSignature(classId, fileName),
  uploadFile: uploadToCloudinary,
  createTask: async (r) => (await teacherApi.createTask(r)).task,
  listTasks: async (classId) => (await teacherApi.listTasks(classId)).tasks,
  getTaskMarks: async (classId, taskId) => (await teacherApi.getTaskMarks(classId, taskId)).marks,
  markTask: (r) => teacherApi.markTask(r),
  getAnalytics: (r) => teacherApi.getAnalytics(r),
};

export const backend: TeacherBackend = TEACHER_MOCK ? mockBackend : realBackend;

/** A message a teacher can act on. */
export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "permission-denied") return "You don't have access to that.";
    if (e.code === "not-found") return e.message && e.message !== "Not Found" ? e.message : "Not found.";
    if (e.code === "unavailable" || e.transient) return "Can't reach the server. Check your connection and try again.";
    if (e.code === "resource-exhausted") return "The server is busy today. Try again later.";
    return e.message || "Something went wrong.";
  }
  return (e as Error)?.message || "Something went wrong.";
}
export const isPermissionDenied = (e: unknown) => e instanceof ApiError && e.code === "permission-denied";
