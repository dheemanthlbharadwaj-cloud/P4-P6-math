// Admin (owner) contract for the classroom: manage teacher logins, every class, and student/user logins from the web
// dashboard at /admin. Single source of truth for backend (backend/functions/src/admin.ts) and app (app/admin/**).
// Admins are Auth users of the STUDENT project with an admins/{uid} doc, created only by
// backend/scripts/add-admin.mjs (never from the app). Every admin* callable requires admins/{caller}.active.
// Reads are kept small: there is NO "list all users" call; users are found one at a time by friend code, email or uid.
import type { ClassDoc, TeacherDoc } from "./classroom";
import type { Grade } from "./types";

// ---------- Firestore layout (server-owned; clients never read it) ----------
//   admins/{uid}          AdminDoc
//   adminLog/{autoId}     AdminLogEntry (every admin write is logged: who, what, target, when)

export interface AdminDoc { uid: string; name: string; email: string; active: boolean; createdAt: number }
export interface AdminLogEntry { at: number; adminUid: string; action: string; target: string; detail?: string }

/** A class as the admin sees it: the class plus its teacher's name. */
export interface AdminClassRow extends ClassDoc { teacherName: string }

/** One login (student or teacher), from Firebase Auth + users/{uid} + teachers/{uid}. */
export interface AdminUserRow {
  uid: string;
  displayName: string; // users/{uid}.fullName, else the teacher name, else the Auth display name, else ""
  email?: string;
  /** Auth sign-in methods, e.g. ["password"], ["google.com"] */
  providers: string[];
  friendCode?: string;
  grade?: Grade;
  classIds: string[];
  disabled: boolean;
  isTeacher: boolean;
  teacherActive?: boolean;
  createdAt?: number; // Auth creation time (ms)
  lastSignInAt?: number; // Auth last sign-in (ms)
}

// ---------- Callables (names added to CallableName in api.ts) ----------
//   adminGetOverview      {} → { admin: AdminDoc; teachers: TeacherDoc[]; classes: AdminClassRow[] }
//                         (reads: 1 admin + teachers + classes collections; cached 60 s per instance)
//   adminSaveTeacher      { email: string; name: string } → { teacher: TeacherDoc; password?: string }
//                         Creates the Auth user (email + generated password) and teachers/{uid}, or renames an existing
//                         teacher / turns an existing student login into a teacher too. `password` is returned ONLY when a
//                         new Auth user was created; the dashboard shows it once with a Copy button and never stores it.
//   adminSetTeacherActive { uid: string; active: boolean } → { ok: true }  (also disables/enables the Auth user)
//   adminResetPassword    { uid: string } → { password: string }
//                         Email/password logins only (failed-precondition for Google-only accounts). Shown once.
//   adminFindUser         { query: string } → { users: AdminUserRow[] }
//                         query = friend code (8 chars, case-insensitive), an email, or a uid. ≤ 5 results.
//   adminSetUserDisabled  { uid: string; disabled: boolean } → { ok: true }  (Auth disable; not for the caller itself)
//   adminSaveClass        { id?: string; name: string; grade: Grade; teacherUid: string } → { classId: string }
//                         Create a class for any teacher, rename it, or move it to another teacher (assign).
//   adminDeleteClass      { classId: string } → { ok: true }
//   adminAddStudent       { classId: string; friendCode: string } → { student: ClassStudent }
//   adminRemoveStudent    { classId: string; studentUid: string } → { ok: true }
// Same rules as the teacher callables (CLASS_LIMITS, users/{uid}.classIds kept in step), just without the ownership
// check. Errors: unauthenticated, permission-denied ("Not an admin"), not-found, invalid-argument, failed-precondition.
export const ADMIN_LIMITS = { findResults: 5 } as const;
