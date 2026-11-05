// Which staff roles the signed-in login has (teacher / admin): admins also see the Teachers menu item.
import { create } from "zustand";
import type { MyRoles } from "@p6/shared";
import { ApiError, getMyRoles } from "../services/api";
import { MOCK_AREAS } from "./mock";
export { areasFor, isParentUid, type Area } from "./logic";

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
    if (MOCK_AREAS) { set({ phase: "ready", roles: { teacher: true, admin: true } }); return; } // ?mock=1: the demo teacher is also an admin
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
