// Every callable of the Catapult Classroom backend (names = ClassroomCallable in packages/shared/src/lessons.ts).
import type { Callable } from "./errors.js";
import type { ClassroomCallable } from "./shared/index.js";
import { adminGetOverview, adminResetAccessCode, adminSaveTeacher, adminSetTeacherActive, getMyRoles } from "./staff.js";
import {
  codeSignIn, parentGetHome, parentSignIn, teacherDeleteFamily, teacherDeleteLesson, teacherGetChild, teacherGetStudents, teacherListLessons, teacherResetFamilyCode,
  teacherSaveFamily, teacherSaveLesson, teacherSaveSession,
} from "./lessons.js";

export const CALLABLES: Record<ClassroomCallable, Callable> = {
  getMyRoles, adminGetOverview, adminSaveTeacher, adminSetTeacherActive, adminResetAccessCode,
  teacherGetStudents, teacherSaveFamily, teacherResetFamilyCode, teacherDeleteFamily, teacherGetChild, teacherListLessons, teacherSaveLesson,
  teacherDeleteLesson, teacherSaveSession, parentSignIn, parentGetHome, codeSignIn,
};
