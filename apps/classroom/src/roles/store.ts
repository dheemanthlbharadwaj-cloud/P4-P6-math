// Which areas the signed-in login may open (Student / Teacher / Admin) and which one was used last (remembered per
// login in this browser, so a teacher lands back on the teacher dashboard).
import { create } from "zustand";
import type { MyRoles } from "@p6/shared";
import { ApiError, getMyRoles } from "../services/api";
import { readLocal, writeLocal } from "../store/storage";
import { MOCK_AREAS } from "./mock";
import type { Area } from "./logic";
export { AREAS, areasFor, startArea, type Area } from "./logic";

import type { RolesPhase } from "./logic";
export type { RolesPhase };
interface RolesState {
  uid: string | null;
  phase: RolesPhase;
  roles: MyRoles;
  load: (uid: string) => Promise<void>;
  reset: () => void;
}

export const useRoles = create<RolesState>((set, get) => ({
  uid: null,
  phase: "idle",
  roles: { teacher: false, admin: false },
  async load(uid) {
    if (get().uid === uid && (get().phase === "ready" || get().phase === "loading")) return;
    set({ uid, phase: "loading" });
    if (MOCK_AREAS) { set({ phase: "ready", roles: { teacher: true, admin: true } }); return; }
    try {
      const roles = await getMyRoles();
      if (get().uid === uid) set({ phase: "ready", roles: { teacher: !!roles.teacher, admin: !!roles.admin } });
    } catch (e) {
      // Before the backend has getMyRoles (or offline): every area is offered and each area checks access itself.
      if (get().uid === uid) set({ phase: "unknown", roles: { teacher: false, admin: false } });
      if (!(e instanceof ApiError)) console.warn("getMyRoles failed", e);
    }
  },
  reset: () => set({ uid: null, phase: "idle", roles: { teacher: false, admin: false } }),
}));

const key = (uid: string) => `p6c.area.${uid}`;
export const lastArea = (uid: string): Area | null => {
  const v = readLocal(key(uid));
  return v === "student" || v === "teacher" || v === "admin" ? v : null;
};
export const rememberArea = (uid: string, area: Area) => writeLocal(key(uid), area);
