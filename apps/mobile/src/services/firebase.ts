// Firebase JS SDK (v12) with RN persistence: keeps native setup light (no google-services files).
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getReactNativePersistence, initializeAuth, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { extra } from "./config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(extra.firebase);
  return app;
}

// Local emulators (EXPO_PUBLIC_USE_EMULATORS=1): auth 9099, firestore 8080 (backend/firebase.json).
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

let firestore: Firestore | null = null;
// primary-math-sg keeps its data in the named database "default" (not "(default)"); the wrong id silently reads an
// empty database.
const DATABASE_ID = extra.firestoreDatabaseId || "(default)";
/** Firestore (owner-only reads/writes of progress, wrong bookmarks, profile; see backend/firestore.rules). */
export function firebaseFirestore(): Firestore {
  if (!firestore) {
    const a = firebaseApp();
    try {
      // Long-polling auto-detect: WebChannel is unreliable on some React Native networks.
      firestore = initializeFirestore(a, { experimentalAutoDetectLongPolling: true }, DATABASE_ID);
    } catch {
      firestore = getFirestore(a, DATABASE_ID); // already initialised (fast refresh)
    }
    if (EMU) connectFirestoreEmulator(firestore, EMU.host, 8080);
  }
  return firestore;
}
