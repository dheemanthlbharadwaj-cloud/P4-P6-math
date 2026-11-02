// Every callable of the Catapult Classroom backend (names = ClassroomCallable in packages/shared/src/lessons.ts).
import type { Callable } from "./errors.js";
import type { ClassroomCallable } from "./shared/index.js";
import { adminGetOverview, adminResetPassword, adminSaveTeacher, adminSetTeacherActive, getMyRoles } from "./staff.js";
import {
  parentGetHome, parentSignIn, teacherDeleteFamily, teacherDeleteLesson, teacherGetChild, teacherGetStudents, teacherListLessons, teacherResetFamilyCode,
  teacherSaveFamily, teacherSaveLesson, teacherSaveSession,
} from "./lessons.js";

export const CALLABLES: Record<ClassroomCallable, Callable> = {
  getMyRoles, adminGetOverview, adminSaveTeacher, adminSetTeacherActive, adminResetPassword,
  teacherGetStudents, teacherSaveFamily, teacherResetFamilyCode, teacherDeleteFamily, teacherGetChild, teacherListLessons, teacherSaveLesson,
  teacherDeleteLesson, teacherSaveSession, parentSignIn, parentGetHome,
};
