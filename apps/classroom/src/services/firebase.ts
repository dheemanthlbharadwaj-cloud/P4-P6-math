// Firebase JS SDK, web build: only Auth is used (the session stays in the browser's indexedDB). All data goes through the
// backend API (services/api.ts); the app never opens Firestore.
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { extra } from "./config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(extra.firebase);
  return app;
}

export function firebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(firebaseApp());
    if (extra.emulators) connectAuthEmulator(auth, `http://${extra.emulators.host}:9099`, { disableWarnings: true });
  }
  return auth;
}
