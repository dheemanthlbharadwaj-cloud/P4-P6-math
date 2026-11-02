import type { ExpoConfig, ConfigContext } from "expo/config";

// Catapult Mathletes Classroom: the web app for students, teachers and the owner (admin). Web only.
// Same Firebase Auth (student project catapult-math-students) and the same Netlify backend as the game.
const env = (k: string, fallback: string) => process.env[k] || fallback;

// Public web config of the student Firebase project (not secret): the same file the game uses.
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
  name: "Catapult Mathletes Classroom",
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
    // Local Firebase emulators (tests): EXPO_PUBLIC_USE_EMULATORS=1 (auth on 9099, backend dev server on 8888).
    emulators: EMU ? { host: EMU_HOST } : null,
    backendUrl: env("EXPO_PUBLIC_BACKEND_URL", EMU ? `http://${EMU_HOST}:8888` : BACKEND.url ?? ""),
    // The game, for "Play the game" links.
    gameUrl: env("EXPO_PUBLIC_GAME_URL", "https://catapult-mathletes.web.app"),
  },
});
