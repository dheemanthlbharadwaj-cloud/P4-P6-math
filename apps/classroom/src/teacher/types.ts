// Request/response types of the teacher callables (packages/shared/src/classroom.ts, "Callables"), kept here because
// the contract documents them in comments only. Names match the callable names.
import type {
  ClassAnalytics, ClassDoc, ClassPost, ClassStudent, ClassTask, Grade, LevelNo, MarkValue, PostAttachment, StudentAnalytics, TaskKind, TaskMarks, TeacherDoc,
} from "@p6/shared";
import type { UploadSignature } from "./helpers";

export interface TeacherDashboard { teacher: TeacherDoc; classes: ClassDoc[] }
export interface SaveClassReq { id?: string; name: string; grade: Grade }
export interface CreateTaskReq { classId: string; kind: TaskKind; title?: string; subtopicId?: string; level?: LevelNo; topicId?: string; dueAt?: number; inApp?: boolean }
export interface PostReq { classId: string; text: string; attachments?: PostAttachment[]; taskId?: string }
export interface MarkTaskReq { classId: string; taskId: string; studentUid: string; marks: Record<string, MarkValue> }
export interface AnalyticsReq { classId: string; studentUid?: string; topicId?: string }
/** NOT in the contract yet (proposed): the teacher's view of a class feed, newest first. */
export interface ListPostsReq { classId: string; before?: number }

/** Everything the dashboard needs from the backend. Implemented by the real callables and by the dev mock. */
export interface TeacherBackend {
  getDashboard(): Promise<TeacherDashboard>;
  saveClass(r: SaveClassReq): Promise<{ classId: string }>;
  deleteClass(classId: string): Promise<void>;
  addStudent(classId: string, friendCode: string): Promise<ClassStudent>;
  removeStudent(classId: string, studentUid: string): Promise<void>;
  setBirthday(classId: string, studentUid: string, birthday: string | null): Promise<void>;
  post(r: PostReq): Promise<ClassPost>;
  deletePost(classId: string, postId: string): Promise<void>;
  /** null = this backend has no post listing yet (the dashboard then shows the posts written in this session). */
  listPosts(r: ListPostsReq): Promise<ClassPost[] | null>;
  uploadSignature(classId: string, fileName: string): Promise<UploadSignature>;
  /** Uploads the file to Cloudinary with the signature; resolves the delivery URL. */
  uploadFile(sig: UploadSignature, file: File): Promise<string>;
  createTask(r: CreateTaskReq): Promise<ClassTask>;
  listTasks(classId: string): Promise<ClassTask[]>;
  getTaskMarks(classId: string, taskId: string): Promise<TaskMarks[]>;
  markTask(r: MarkTaskReq): Promise<{ starsAwarded: number }>;
  getAnalytics(r: AnalyticsReq): Promise<{ class: ClassAnalytics; student?: StudentAnalytics }>;
}
