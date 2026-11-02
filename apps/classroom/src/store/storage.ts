// Browser storage for the few things kept between visits (the staff area used last, the demo data in ?mock=1).
// Private windows / blocked storage: everything still works, it just isn't remembered.
import { createJSONStorage } from "zustand/middleware";

const safe = {
  getItem: (k: string) => { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } },
  setItem: (k: string, v: string) => { try { globalThis.localStorage?.setItem(k, v); } catch { /* full or blocked */ } },
  removeItem: (k: string) => { try { globalThis.localStorage?.removeItem(k); } catch { /* blocked */ } },
};
export const persistStorage = createJSONStorage(() => safe);
export const STORE_PREFIX = "p6c.";
export const readLocal = safe.getItem;
export const writeLocal = safe.setItem;
