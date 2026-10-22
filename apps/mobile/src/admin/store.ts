// Dashboard state (not persisted): the signed-in admin, every teacher and class, and the current section.
import { create } from "zustand";
import type { AdminClassRow, AdminDoc, TeacherDoc } from "@p6/shared";
import { backend, friendlyError, isPermissionDenied } from "./client";

export type Section = "teachers" | "classes" | "logins";
export const SECTIONS: { id: Section; label: string }[] = [
  { id: "teachers", label: "Teachers" },
  { id: "classes", label: "Classes" },
  { id: "logins", label: "Logins" },
];

export type Phase = "idle" | "loading" | "ready" | "denied" | "error";
interface AdminState {
  phase: Phase;
  error: string | null;
  admin: AdminDoc | null;
  teachers: TeacherDoc[];
  classes: AdminClassRow[];
  classId: string | null;
  section: Section;
  load: () => Promise<void>;
  upsertTeacher: (t: TeacherDoc) => void;
  patchTeacher: (uid: string, patch: Partial<TeacherDoc>) => void;
  setClasses: (classes: AdminClassRow[]) => void;
  patchClass: (id: string, patch: Partial<AdminClassRow>) => void;
  selectClass: (id: string | null) => void;
  go: (section: Section) => void;
  reset: () => void;
}

export const useAdmin = create<AdminState>((set, get) => ({
  phase: "idle", error: null, admin: null, teachers: [], classes: [], classId: null, section: "teachers",
  async load() {
    set({ phase: "loading", error: null });
    try {
      const d = await backend.getOverview();
      set({ phase: "ready", admin: d.admin, teachers: d.teachers, classes: d.classes, classId: d.classes.some((c) => c.id === get().classId) ? get().classId : null });
    } catch (e) {
      set(isPermissionDenied(e) ? { phase: "denied", error: null } : { phase: "error", error: friendlyError(e) });
    }
  },
  upsertTeacher: (t) => set((s) => ({
    teachers: s.teachers.some((x) => x.uid === t.uid) ? s.teachers.map((x) => (x.uid === t.uid ? t : x)) : [...s.teachers, t],
    classes: s.classes.map((c) => (c.teacherUid === t.uid ? { ...c, teacherName: t.name } : c)),
  })),
  patchTeacher: (uid, patch) => set((s) => ({
    teachers: s.teachers.map((t) => (t.uid === uid ? { ...t, ...patch } : t)),
    classes: patch.name ? s.classes.map((c) => (c.teacherUid === uid ? { ...c, teacherName: patch.name as string } : c)) : s.classes,
  })),
  setClasses: (classes) => set((s) => ({ classes, classId: classes.some((c) => c.id === s.classId) ? s.classId : null })),
  patchClass: (id, patch) => set((s) => ({ classes: s.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  selectClass: (classId) => set({ classId }),
  go: (section) => set({ section }),
  reset: () => set({ phase: "idle", error: null, admin: null, teachers: [], classes: [], classId: null, section: "teachers" }),
}));
