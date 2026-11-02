// Dashboard state (not persisted): who is signed in as a teacher, their classes and the current section / class.
import { create } from "zustand";
import type { ClassDoc, TeacherDoc } from "@p6/shared";
import { backend, friendlyError, isPermissionDenied } from "./client";

export type Section = "classes" | "posts" | "tasks" | "marking" | "analytics";
export const SECTIONS: { id: Section; label: string }[] = [
  { id: "classes", label: "Classes" },
  { id: "posts", label: "Posts" },
  { id: "tasks", label: "Worksheets & tests" },
  { id: "marking", label: "Marking" },
  { id: "analytics", label: "Analytics" },
];

export type Phase = "idle" | "loading" | "ready" | "denied" | "error";
interface TeacherState {
  phase: Phase;
  error: string | null;
  teacher: TeacherDoc | null;
  classes: ClassDoc[];
  classId: string | null;
  section: Section;
  /** hand-offs between sections: "Mark" on a task, "Post answers" on a task */
  markTaskId: string | null;
  postTaskId: string | null;
  load: () => Promise<void>;
  setClasses: (classes: ClassDoc[]) => void;
  patchClass: (id: string, patch: Partial<ClassDoc>) => void;
  selectClass: (id: string | null) => void;
  go: (section: Section, opts?: { markTaskId?: string | null; postTaskId?: string | null }) => void;
  reset: () => void;
}

export const useTeacher = create<TeacherState>((set, get) => ({
  phase: "idle", error: null, teacher: null, classes: [], classId: null, section: "classes", markTaskId: null, postTaskId: null,
  async load() {
    set({ phase: "loading", error: null });
    try {
      const d = await backend.getDashboard();
      const keep = get().classId;
      set({ phase: "ready", teacher: d.teacher, classes: d.classes, classId: d.classes.some((c) => c.id === keep) ? keep : d.classes[0]?.id ?? null });
    } catch (e) {
      set(isPermissionDenied(e) ? { phase: "denied", error: null } : { phase: "error", error: friendlyError(e) });
    }
  },
  setClasses: (classes) => set((s) => ({ classes, classId: classes.some((c) => c.id === s.classId) ? s.classId : classes[0]?.id ?? null })),
  patchClass: (id, patch) => set((s) => ({ classes: s.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
  selectClass: (classId) => set({ classId }),
  go: (section, opts) => set({ section, markTaskId: opts?.markTaskId ?? null, postTaskId: opts?.postTaskId ?? null }),
  reset: () => set({ phase: "idle", error: null, teacher: null, classes: [], classId: null, section: "classes", markTaskId: null, postTaskId: null }),
}));

export const selectedClass = (s: Pick<TeacherState, "classes" | "classId">): ClassDoc | undefined => s.classes.find((c) => c.id === s.classId);
