// Firebase JS SDK (v12) with RN persistence: keeps native setup light (no google-services files).
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getReactNativePersistence, initializeAuth, getAuth, type Auth } from "firebase/auth";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { extra } from "./config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(extra.firebase);
  return app;
}

// Local emulators (EXPO_PUBLIC_USE_EMULATORS=1): auth 9099. The app has no direct Firestore access: all data goes
// through the backend API (services/api.ts), so it never depends on the shared database's security rules.
const EMU = extra.emulators;

export function firebaseAuth(): Auth {
  if (!auth) {
    const a = firebaseApp();
    try {
      // Web keeps the session in the browser (indexedDB); native apps in AsyncStorage.
      auth = Platform.OS === "web" ? getAuth(a) : initializeAuth(a, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch {
      auth = getAuth(a); // already initialised (fast refresh)
    }
    if (EMU) connectAuthEmulator(auth, `http://${EMU.host}:9099`, { disableWarnings: true });
  }
  return auth;
}
