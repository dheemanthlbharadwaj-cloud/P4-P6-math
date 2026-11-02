// Admin area state (not persisted): the signed-in admin and every teacher.
import { create } from "zustand";
import type { TeacherDoc } from "@p6/shared";
import { backend, friendlyError, isPermissionDenied } from "./client";

export type Section = "teachers";
export const SECTIONS: { id: Section; label: string }[] = [{ id: "teachers", label: "Teachers" }];
export type Phase = "idle" | "loading" | "ready" | "denied" | "error";
interface AdminState {
  phase: Phase;
  error: string | null;
  admin: TeacherDoc | null;
  teachers: TeacherDoc[];
  section: Section;
  load: () => Promise<void>;
  upsertTeacher: (t: TeacherDoc) => void;
  patchTeacher: (uid: string, patch: Partial<TeacherDoc>) => void;
  go: (section: Section) => void;
  reset: () => void;
}
export const useAdmin = create<AdminState>((set) => ({
  phase: "idle", error: null, admin: null, teachers: [], section: "teachers",
  async load() {
    set({ phase: "loading", error: null });
    try {
      const d = await backend.getOverview();
      set({ phase: "ready", admin: d.admin, teachers: d.teachers });
    } catch (e) {
      set(isPermissionDenied(e) ? { phase: "denied", error: null } : { phase: "error", error: friendlyError(e) });
    }
  },
  upsertTeacher: (t) => set((s) => ({ teachers: s.teachers.some((x) => x.uid === t.uid) ? s.teachers.map((x) => (x.uid === t.uid ? t : x)) : [...s.teachers, t] })),
  patchTeacher: (uid, patch) => set((s) => ({ teachers: s.teachers.map((t) => (t.uid === uid ? { ...t, ...patch } : t)) })),
  go: (section) => set({ section }),
  reset: () => set({ phase: "idle", error: null, admin: null, teachers: [], section: "teachers" }),
}));
