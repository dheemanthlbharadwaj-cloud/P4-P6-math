# Android app: build, publish, update

One codebase (`apps/mobile`) serves the web app, Android and iOS. Phones get changes in two ways:

| Change | How it reaches phones |
| --- | --- |
| JS/TS code, screens, question content, figures, images | **Over-the-air update** (automatic): push to `main` or `ccr-41770098-9l0q6b` touching `apps/mobile/**` or `packages/shared/**` → EAS workflow `apps/mobile/.eas/workflows/publish-update.yml` publishes to the `preview` channel → phones download it on launch and use it on the next launch. |
| Same native code, new JS (e.g. while the Expo CI minutes are used up) | **New APK, same `version`**: raise only `android.versionCode` in `app.config.ts` (2 = 17 Oct 2026). Installs over the old APK and every copy keeps taking over-the-air updates. |
| Native: a new native module, permissions, icon/splash, `app.config.ts` plugins, Expo SDK upgrade | **New APK**: bump `version` in `app.config.ts` (runtime version = app version, so old APKs stop taking updates meant for the new one), build, publish the APK. |

Skip an update for a commit with `[eas skip]` in the commit message. **Expo free plan: 60 CI minutes a month (about 4 update runs); used up until 1 Nov 2026.** Batch app changes and use `[eas skip]` for commits that don't need to reach phones.

**Web app:** `.github/workflows/deploy-web.yml` (GitHub Actions, free for this public repo) rebuilds and publishes https://catapult-math-athletes.web.app on every push touching `apps/mobile/**` or `packages/shared/**`. It authenticates keylessly: GitHub OIDC → workload identity pool `github` / provider `github-actions` in primary-math-sg (condition: repository `dheemanthlbharadwaj-cloud/P4-P6-math`) → `catapult-web-deployer` (Firebase Hosting Admin only). No secrets exist to leak or rotate.

## Where things are

| What | Where |
| --- | --- |
| Expo project | expo.dev → account **dheems-team** → `catapult-math-athletes` (id `ea8a1c9d-c3dd-4cac-903d-78956443efe9`), GitHub repo linked, base directory `apps/mobile` |
| Tester download page | https://catapult-math-athletes-download.netlify.app (Netlify site `catapult-math-athletes-download`). **Archived: team-only (Netlify login)** until the owner says to show it; `deploy-apk.mjs --public` opens it. |
| Signing key | Firestore `app_secrets/android-signing` (master-only by rules): `keystore_p12_b64`, `password`, alias `catapult`. SHA-256 `4D:FB:23:51:…:22:2A`. **Every APK must use it**, or testers have to uninstall to update. |
| App id | `sg.catapultmathathletes.app` (permanent once on Play) |

## Build a new APK (local, in a cloud session)

1. Android SDK in `/root/android-sdk` (cmdline-tools, `platforms;android-36`, `build-tools;36.0.0`, `ndk;27.1.12297006`); JDK 21.
2. `node scripts/android-key.mjs` (fetch + verify), then `node scripts/android-key.mjs --write-gradle-props`; check it printed "wrote signing properties". **Always confirm the SHA-256 with `apksigner` after the build**: without the properties Gradle silently signs with the debug key.
3. `cd apps/mobile && EXPO_PUBLIC_APP_ENV=preview EXPO_PUBLIC_DEV_TOOLS=1 npx expo prebuild --platform android --no-install --clean`
4. `cd android && ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a,armeabi-v7a` with the key passed as `android.injected.signing.store.file / store.password / key.alias / key.password` Gradle properties (remove them afterwards). Maven Central sometimes answers 429 through the proxy: just retry; the Gradle cache keeps progress.
5. Check: `apksigner verify --print-certs` shows the SHA-256 above.
6. Copy to `apps/mobile/dist-apk/catapult-math-athletes.apk` (gitignored) and run `node apps/mobile/scripts/deploy-apk.mjs`.

## Why it is set up this way

- **Updates through EAS, APK built locally.** Updates need no signing key, so the key never has to be uploaded to Expo; local builds sign with our own key. EAS cloud builds would need the key uploaded to Expo credentials first (`eas credentials`, needs an `EXPO_TOKEN`).
- **Figures are packed** (`scripts/build-figpacks.mjs`, run on `npm install` and by the content pipeline): an EAS update may hold at most 1000 files and there are ~1650 figures. Four ~12 MB packs ship instead; a phone cuts each figure out of its pack the first time it is needed and keeps it (works offline).
- **APK on Netlify, not Firebase Hosting.** The Firebase project is on the free plan: ~360 MB/day of downloads for the whole project, i.e. 2–3 APKs a day, and going over would take the web app down for the day.
- **Both ARM chip types** (arm64-v8a, armeabi-v7a) so older, cheaper phones install it. No x86, so it does not run on a PC emulator.
- **Google sign-in** on Android is native (`@react-native-google-signin/google-signin`, since 0.2.0): `GoogleSignin.configure({ webClientId })` with the WEB client id (`firebase.web.json` googleWebClientId), and the id token goes to Firebase. It needs the Android OAuth client (package `sg.catapultmathathletes.app` + the release key SHA-1 95:5C:9B:...:4F:E3) registered in primary-math-sg; a new signing key needs its SHA-1 added in Firebase first. iOS keeps the "coming soon" message until `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is set.
- **Ads** use Google's test ad units until real AdMob ids are set (`EXPO_PUBLIC_ADMOB_*`).
- **Local notifications** (since 0.3.0, native module `expo-notifications`, so it needs this new APK; OTA updates only reach 0.3.0 builds). "Hearts are full" at the next local midnight and optional daily practice reminders (Profile > Reminders); phone apps only, never on web. Android 13+ `POST_NOTIFICATIONS` comes from the library manifest and is asked only when the kid turns a reminder on (or the first time hearts run out). Channel `reminders` (default importance). Inexact delivery: no `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`. Test on a device with Dev Tools > Notifications ("Send test notification in 10 s", "Show scheduled reminders").
