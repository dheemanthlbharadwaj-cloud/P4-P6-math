import Constants from "expo-constants";

interface Extra {
  firebase: { apiKey: string; authDomain: string; projectId: string; storageBucket: string; messagingSenderId: string; appId: string };
  emulators: { host: string } | null;
  backendUrl: string;
  gameUrl: string;
}

const raw = (Constants.expoConfig?.extra ?? {}) as Extra;
// The web export serialises `emulators: null` as {}: only a host means emulators are on.
export const extra: Extra = { ...raw, emulators: raw.emulators?.host ? raw.emulators : null };
export const isFirebaseConfigured = (!!extra.firebase?.apiKey && extra.firebase.apiKey !== "PLACEHOLDER") || !!extra.emulators;
