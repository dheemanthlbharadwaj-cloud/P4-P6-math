// DEV TOOLS (testing only). On in development builds and in test builds made with EXPO_PUBLIC_DEV_TOOLS=1
// (the web preview). Store/release builds never set it, so the panel and its shortcuts don't exist there.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { persistStorage, STORE_PREFIX } from "../store/storage";

export const DEV_TOOLS = (typeof __DEV__ !== "undefined" && __DEV__) || process.env.EXPO_PUBLIC_DEV_TOOLS === "1";

export type AdOutcome = "rewarded" | "load-failed" | "dismissed";

interface DevState {
  adOutcome: AdOutcome; // what the next rewarded ads return (web/mock ads)
  setAdOutcome: (o: AdOutcome) => void;
}

export const useDev = create<DevState>()(
  persist((set) => ({ adOutcome: "rewarded", setAdOutcome: (adOutcome) => set({ adOutcome }) }), {
    name: `${STORE_PREFIX}dev`,
    storage: persistStorage,
  }),
);
