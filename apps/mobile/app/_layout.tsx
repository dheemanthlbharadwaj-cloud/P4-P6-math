import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import NetInfo from "@react-native-community/netinfo";
import { watchAuth } from "../src/services/auth";
import { isFirebaseConfigured } from "../src/services/config";
import { initAds } from "../src/services/ads";
import { initPurchases } from "../src/services/purchases";
import { flushOfflineQueue } from "../src/services/sync";
import { bootstrapServerProfile, refreshFriends } from "../src/services/bootstrap";
import { useAuth } from "../src/store/auth";
import { useProfile } from "../src/store/profile";
import { useProgress } from "../src/store/progress";
import { resetAllStores } from "../src/store/reset";
import { useHydrated } from "../src/hooks/useHydrated";
import { colors } from "../src/theme/colors";

export default function RootLayout() {
  const hydrated = useHydrated();
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

  // A different account on this device starts clean; same account keeps local progress.
  useEffect(() => {
    if (!hydrated || !user) return;
    const p = useProfile.getState();
    if (p.uid && p.uid !== user.uid) resetAllStores();
    useProfile.getState().set({ uid: user.uid, email: user.email });
  }, [hydrated, user]);

  const signedIn = !!user || uid === "guest"; // "guest" = dev-only mode when Firebase is not configured

  // Route guard.
  useEffect(() => {
    if (!hydrated || !ready) return;
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
  }, [hydrated, ready, signedIn, onboarded, segments, router]);

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
    void bootstrapServerProfile().then(run);
    void initPurchases(user.uid);
    const unsub = NetInfo.addEventListener((s) => { if (s.isConnected) void run(); });
    const timer = setInterval(run, 60_000);
    return () => { cancelled = true; unsub(); clearInterval(timer); };
  }, [hydrated, user, onboarded]);

  if (!hydrated || !ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="level/[grade]/[nodeId]/[level]" options={{ gestureEnabled: false }} />
        <Stack.Screen name="minigame/[mode]" options={{ gestureEnabled: false }} />
      </Stack>
    </>
  );
}
