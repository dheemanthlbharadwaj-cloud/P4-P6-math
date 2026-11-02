import type { ExpoConfig, ConfigContext } from "expo/config";

// Catapult Classroom: the web app for parents (family code) and teachers / the owner (admin). Web only.
// Its OWN Firebase project (catapult-classroom: Auth + Firestore + Hosting) and its OWN backend (backend-classroom on its own
// Netlify site), never the game's (owner decision 2 Nov 2026: separate limits).
const env = (k: string, fallback: string) => process.env[k] || fallback;

// Public web config of the classroom Firebase project (not secret), written by backend-classroom/scripts/setup-project.mjs.
// Empty until the project exists: the app then says "Sign-in isn't set up in this build".
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WEB: Partial<Record<"apiKey" | "authDomain" | "projectId" | "storageBucket" | "messagingSenderId" | "appId", string>> = (() => {
  try { return require("./firebase.web.json"); } catch { return {}; }
})();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BACKEND: { url?: string } = (() => { try { return require("./backend.json"); } catch { return {}; } })();
const EMU = env("EXPO_PUBLIC_USE_EMULATORS", "") === "1";
const EMU_HOST = env("EXPO_PUBLIC_EMULATOR_HOST", "127.0.0.1");

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Catapult Classroom",
  slug: "catapult-mathletes-classroom",
  scheme: "p6classroom",
  version: "0.1.0",
  platforms: ["web"],
  userInterfaceStyle: "light",
  web: { bundler: "metro", output: "single", favicon: "../mobile/assets/ui/app-icon.png" },
  plugins: ["expo-router"],
  experiments: { typedRoutes: false },
  extra: {
    firebase: {
      apiKey: env("EXPO_PUBLIC_FIREBASE_API_KEY", WEB.apiKey ?? "PLACEHOLDER"),
      authDomain: env("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", WEB.authDomain ?? ""),
      projectId: env("EXPO_PUBLIC_FIREBASE_PROJECT_ID", WEB.projectId ?? ""),
      storageBucket: env("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", WEB.storageBucket ?? ""),
      messagingSenderId: env("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", WEB.messagingSenderId ?? "0"),
      appId: env("EXPO_PUBLIC_FIREBASE_APP_ID", WEB.appId ?? "PLACEHOLDER"),
    },
    // Local Firebase emulators (tests): EXPO_PUBLIC_USE_EMULATORS=1 (auth on 9099, backend-classroom dev server on 8899).
    emulators: EMU ? { host: EMU_HOST } : null,
    // backend-classroom (backend.json is written by backend-classroom/scripts/deploy.mjs; emulators: its dev server on 8899)
    backendUrl: env("EXPO_PUBLIC_BACKEND_URL", EMU ? `http://${EMU_HOST}:8899` : BACKEND.url ?? ""),
    // The game, for "Play the game" links.
    gameUrl: env("EXPO_PUBLIC_GAME_URL", "https://catapult-mathletes.web.app"),
  },
});
