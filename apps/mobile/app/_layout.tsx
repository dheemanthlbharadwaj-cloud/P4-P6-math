import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { AppFrame } from "../src/theme/frame";
import { StatusBar } from "expo-status-bar";
import NetInfo from "@react-native-community/netinfo";
import { useFonts } from "expo-font";
import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka/600SemiBold";
import { Fredoka_700Bold } from "@expo-google-fonts/fredoka/700Bold";
import { watchAuth } from "../src/services/auth";
import { isFirebaseConfigured } from "../src/services/config";
import { initAds } from "../src/services/ads";
import { initPurchases } from "../src/services/purchases";
import { flushOfflineQueue } from "../src/services/sync";
import { bootstrapServerProfile, refreshFriends, restoreAccount } from "../src/services/bootstrap";
import { stopCloudSync } from "../src/services/cloudSync";
import { useAuth } from "../src/store/auth";
import { useProfile } from "../src/store/profile";
import { useProgress } from "../src/store/progress";
import { resetAllStores } from "../src/store/reset";
import { useHydrated } from "../src/hooks/useHydrated";
import { colors } from "../src/theme/colors";
import { lockPortrait } from "../src/hooks/useQuestionOrientation";
import { DevToolsButton } from "../src/dev/DevToolsPanel";

export default function RootLayout() {
  const hydrated = useHydrated();
  const [fontsLoaded, fontError] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold });
  const fontsReady = fontsLoaded || !!fontError; // a font failure falls back to the system font
  const { user, ready, setUser } = useAuth();
  const uid = useProfile((s) => s.uid);
  const onboarded = useProfile((s) => s.onboarded);
  const router = useRouter();
  const segments = useSegments();

  // Auth listener (Firebase persists the session; offline start still resolves from cache).
  useEffect(() => {
    if (!isFirebaseConfigured) { setUser(null); return; }
    return watchAuth(setUser);
  }, [setUser]);

  useEffect(() => { void initAds(); }, []);

  // Portrait everywhere; question screens unlock themselves (useQuestionOrientation).
  useEffect(() => { void lockPortrait(); }, []);

  // A different account on this device starts clean; same account keeps local progress.
  useEffect(() => {
    if (!hydrated || !user) return;
    const p = useProfile.getState();
    if (p.uid && p.uid !== user.uid) resetAllStores();
    useProfile.getState().set({ uid: user.uid, email: user.email });
  }, [hydrated, user]);

  // New device / reinstall: after sign-in, look the account up on the server BEFORE showing onboarding, so an
  // existing student gets progress, stars, inventory, look and entitlement back instead of a blank start.
  const [restore, setRestore] = useState<"idle" | "checking" | "done">("idle");
  useEffect(() => { if (!user) setRestore("idle"); }, [user]);
  useEffect(() => {
    if (!hydrated || !user || onboarded || restore !== "idle") return;
    setRestore("checking");
    void restoreAccount().finally(() => setRestore("done"));
  }, [hydrated, user, onboarded, restore]);
  const restoring = !!user && !onboarded && restore !== "done";

  const signedIn = !!user || uid === "guest"; // "guest" = dev-only mode when Firebase is not configured

  // Route guard.
  useEffect(() => {
    if (!hydrated || !ready || restoring) return;
    const group = segments[0] as string | undefined;
    const inOnboarding = group === "(onboarding)";
    const onLogin = inOnboarding && (segments as string[])[1] === "login";
    if (!signedIn) {
      if (!onLogin) router.replace("/(onboarding)/login");
    } else if (!onboarded) {
      if (!inOnboarding || onLogin) router.replace("/(onboarding)/name");
    } else if (inOnboarding || group === undefined) {
      router.replace("/(tabs)/map");
    }
  }, [hydrated, ready, restoring, signedIn, onboarded, segments, router]);

  // Keep progress initialised for the active grade.
  useEffect(() => {
    if (hydrated && onboarded) {
      const p = useProfile.getState();
      useProgress.getState().ensureGrade(p.grade, p.topicsLearnt);
    }
  }, [hydrated, onboarded]);

  // Server sync: bootstrap, RevenueCat, friends, offline queue flush whenever we are online.
  useEffect(() => {
    if (!hydrated || !user || !onboarded) return;
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await flushOfflineQueue();
      await refreshFriends();
    };
    // RevenueCat last: when configured it is the live source of truth for the entitlement (server value otherwise).
    void bootstrapServerProfile().then(run).then(() => initPurchases(user.uid));
    // Only when the connection comes back (the listener also fires on subscribe and on every network detail change).
    let online = true;
    const unsub = NetInfo.addEventListener((s) => {
      const now = !!s.isConnected;
      if (now && !online) void run();
      online = now;
    });
    const timer = setInterval(run, 60_000);
    return () => { cancelled = true; unsub(); clearInterval(timer); stopCloudSync(); };
  }, [hydrated, user, onboarded]);

  if (!hydrated || !ready || !fontsReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  // Question screens use the wide frame on big browser windows (question + working space side by side).
  const wide = ["level", "minigame", "practice"].includes(segments[0] as string);
  return (
    <AppFrame wide={wide}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="level/[grade]/[nodeId]/[level]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="minigame/[mode]" options={{ gestureEnabled: false }} />
      </Stack>
      <DevToolsButton />
      {/* Looking the account up after sign-in: cover the screens instead of unmounting the navigator (a remount loses
          the route and lands on a screen without its params). */}
      {restoring ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}
    </AppFrame>
  );
}
