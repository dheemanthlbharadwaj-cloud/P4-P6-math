// Firebase JS SDK (v12) with RN persistence: keeps native setup light (no google-services files).
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth, getAuth, type Auth } from "firebase/auth";
import { getFunctions, type Functions } from "firebase/functions";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { extra, FUNCTIONS_REGION } from "./config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let functions: Functions | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(extra.firebase);
  return app;
}

export function firebaseAuth(): Auth {
  if (!auth) {
    const a = firebaseApp();
    try {
      auth = initializeAuth(a, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch {
      auth = getAuth(a); // already initialised (fast refresh)
    }
  }
  return auth;
}

export function firebaseFunctions(): Functions {
  if (!functions) functions = getFunctions(firebaseApp(), FUNCTIONS_REGION);
  return functions;
}

let firestore: Firestore | null = null;
/** Firestore (owner-only reads/writes of progress, wrong bookmarks, profile; see backend/firestore.rules). */
export function firebaseFirestore(): Firestore {
  if (!firestore) {
    const a = firebaseApp();
    try {
      // Long-polling auto-detect: WebChannel is unreliable on some React Native networks.
      firestore = initializeFirestore(a, { experimentalAutoDetectLongPolling: true });
    } catch {
      firestore = getFirestore(a); // already initialised (fast refresh)
    }
  }
  return firestore;
}
