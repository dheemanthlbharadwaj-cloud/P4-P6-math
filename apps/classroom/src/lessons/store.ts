// Teacher area state (not persisted): who is signed in as staff, the students (families + children) and the lesson library.
import { create } from "zustand";
import type { Child, Family, Lesson } from "@p6/shared";
import { backend } from "./client";
import { friendlyError, isPermissionDenied } from "../services/errors";

export type Section = "lessons" | "students" | "builder";
export const SECTIONS: { id: Section; label: string }[] = [
  { id: "lessons", label: "Lessons" },
  { id: "students", label: "Students" },
  { id: "builder", label: "Worksheet builder" },
];
export type Phase = "idle" | "loading" | "ready" | "denied" | "error";

interface TeacherState {
  phase: Phase;
  error: string | null;
  families: Family[];
  children: Child[];
  /** admins only: the active teachers, to give a family to one */
  teachers: { uid: string; name: string }[] | null;
  lessons: Lesson[];
  section: Section;
  load: () => Promise<void>;
  go: (s: Section) => void;
  upsertFamily: (f: Family, kids: Child[]) => void;
  removeFamily: (familyId: string) => void;
  upsertLesson: (l: Lesson) => void;
  removeLesson: (id: string) => void;
  reset: () => void;
}

export const useTeacher = create<TeacherState>((set) => ({
  phase: "idle", error: null, families: [], children: [], teachers: null, lessons: [], section: "lessons",
  async load() {
    set({ phase: "loading", error: null });
    try {
      const [st, ls] = await Promise.all([backend.getStudents(), backend.listLessons()]);
      set({ phase: "ready", families: st.families, children: st.children, teachers: st.teachers ?? null, lessons: ls.lessons });
    } catch (e) {
      set(isPermissionDenied(e) ? { phase: "denied", error: null } : { phase: "error", error: friendlyError(e) });
    }
  },
  go: (section) => set({ section }),
  upsertFamily: (f, kids) => set((s) => ({
    families: [...s.families.filter((x) => x.id !== f.id), f],
    children: [...s.children.filter((c) => c.familyId !== f.id), ...kids],
  })),
  removeFamily: (familyId) => set((s) => ({ families: s.families.filter((f) => f.id !== familyId), children: s.children.filter((c) => c.familyId !== familyId) })),
  upsertLesson: (l) => set((s) => ({ lessons: [...s.lessons.filter((x) => x.id !== l.id), l].sort((a, b) => a.title.localeCompare(b.title)) })),
  removeLesson: (id) => set((s) => ({ lessons: s.lessons.filter((l) => l.id !== id) })),
  reset: () => set({ phase: "idle", error: null, families: [], children: [], teachers: null, lessons: [], section: "lessons" }),
}));
