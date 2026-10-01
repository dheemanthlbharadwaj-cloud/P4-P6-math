import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CatLook } from "@p6/shared";
import { persistStorage, STORE_PREFIX } from "./storage";

interface CosmeticsState {
  owned: string[]; // item ids (server is the source of truth; synced on purchase/bootstrap)
  colorId: string;
  hatId: string | null;
  grantOwned: (ids: string[]) => void;
  equip: (itemId: string, kind: "hat" | "color") => void;
  unequipHat: () => void;
  look: () => CatLook;
  reset: () => void;
}

const initial = () => ({ owned: ["color-black"], colorId: "color-black", hatId: null as string | null });

export const useCosmetics = create<CosmeticsState>()(
  persist(
    (set, get) => ({
      ...initial(),
      grantOwned: (ids) => set({ owned: [...new Set([...get().owned, ...ids])] }),
      equip: (id, kind) => (kind === "hat" ? set({ hatId: id }) : set({ colorId: id })),
      unequipHat: () => set({ hatId: null }),
      look: () => ({ colorId: get().colorId, hatId: get().hatId }),
      reset: () => set(initial()),
    }),
    { name: `${STORE_PREFIX}cosmetics`, storage: persistStorage },
  ),
);
