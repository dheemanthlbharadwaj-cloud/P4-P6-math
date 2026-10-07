import type { ExpoConfig, ConfigContext } from "expo/config";

// All secrets / ids come from EXPO_PUBLIC_* env vars (see .env.example). Placeholders keep the build working.
const env = (k: string, fallback: string) => process.env[k] || fallback;

// Google's published test app ids: safe placeholders until the real AdMob apps exist (open question #13).
const ADMOB_ANDROID_APP_ID = env("EXPO_PUBLIC_ADMOB_ANDROID_APP_ID", "ca-app-pub-3940256099942544~3347511713");
const ADMOB_IOS_APP_ID = env("EXPO_PUBLIC_ADMOB_IOS_APP_ID", "ca-app-pub-3940256099942544~1458002511");
const BUNDLE_ID = env("EXPO_PUBLIC_BUNDLE_ID", "sg.p6math.app");

// Committed web config of the student Firebase project (written by backend/scripts/setup-project.mjs).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WEB: Partial<Record<"apiKey" | "authDomain" | "projectId" | "storageBucket" | "messagingSenderId" | "appId", string>> = (() => {
  try { return require("./firebase.web.json"); } catch { return {}; }
})();
// Backend API base URL (the Netlify site), written by backend/scripts/deploy-netlify.mjs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BACKEND: { url?: string } = (() => { try { return require("./backend.json"); } catch { return {}; } })();

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Catapult Math Athletes",
  slug: "catapult-math-athletes",
  scheme: "p6math",
  version: "0.1.0",
  orientation: "default",
  userInterfaceStyle: "light",
  // TODO(owner): supply icon.png (1024x1024) and splash.png in assets/ui, then uncomment.
  // icon: "./assets/ui/app-icon.png",
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: true,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: BUNDLE_ID,
  },
  plugins: [
    "expo-router",
    "expo-apple-authentication",
    [
      "expo-build-properties",
      {
        android: { minSdkVersion: 24 },
        ios: { deploymentTarget: "16.4" },
      },
    ],
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: ADMOB_ANDROID_APP_ID,
        iosAppId: ADMOB_IOS_APP_ID,
        // Child-directed app: no ATT prompt, no tracking.
        delayAppMeasurementInit: true,
      },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: {
    // The student app's Firebase web config (not secret): firebase.web.json, written by backend/scripts/setup-project.mjs
    // once the project exists; EXPO_PUBLIC_FIREBASE_* env vars override it.
    firebase: {
      apiKey: env("EXPO_PUBLIC_FIREBASE_API_KEY", WEB.apiKey ?? "PLACEHOLDER"),
      authDomain: env("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", WEB.authDomain ?? "p6-math-game.firebaseapp.com"),
      projectId: env("EXPO_PUBLIC_FIREBASE_PROJECT_ID", WEB.projectId ?? "p6-math-game"),
      storageBucket: env("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", WEB.storageBucket ?? "p6-math-game.appspot.com"),
      messagingSenderId: env("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", WEB.messagingSenderId ?? "0"),
      appId: env("EXPO_PUBLIC_FIREBASE_APP_ID", WEB.appId ?? "PLACEHOLDER"),
    },
    // Local Firebase emulators (testing): EXPO_PUBLIC_USE_EMULATORS=1, host EXPO_PUBLIC_EMULATOR_HOST (default 127.0.0.1).
    emulators: env("EXPO_PUBLIC_USE_EMULATORS", "") === "1" ? { host: env("EXPO_PUBLIC_EMULATOR_HOST", "127.0.0.1") } : null,
    // Backend API (POST <url>/api/<name>); with the emulators, the local dev server (backend/netlify/dev-server.mjs).
    backendUrl: env("EXPO_PUBLIC_BACKEND_URL", env("EXPO_PUBLIC_USE_EMULATORS", "") === "1" ? `http://${env("EXPO_PUBLIC_EMULATOR_HOST", "127.0.0.1")}:8888` : BACKEND.url ?? ""),
    revenueCat: {
      ios: env("EXPO_PUBLIC_REVENUECAT_IOS_KEY", ""),
      android: env("EXPO_PUBLIC_REVENUECAT_ANDROID_KEY", ""),
    },
    admob: {
      rewardedAndroid: env("EXPO_PUBLIC_ADMOB_REWARDED_ANDROID", ""),
      rewardedIos: env("EXPO_PUBLIC_ADMOB_REWARDED_IOS", ""),
    },
    auth: {
      // TODO(owner): OAuth client ids from the Firebase/Google Cloud console.
      googleWebClientId: env("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", ""),
      googleIosClientId: env("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID", ""),
      googleAndroidClientId: env("EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID", ""),
    },
    referralBaseUrl: env("EXPO_PUBLIC_REFERRAL_BASE_URL", "https://p6math.app/r"),
  },
});
