import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage } from "zustand/middleware";

// AsyncStorage keeps native setup light (no MMKV/Nitro). Swap here if MMKV is adopted later.
export const persistStorage = createJSONStorage(() => AsyncStorage);
export const STORE_PREFIX = "p6.";
