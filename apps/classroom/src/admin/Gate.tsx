// Everything under /admin passes through here (any screen size); the owner signs in with email and
// password (the same Firebase sign-in as students and teachers); then adminGetOverview decides: permission-denied means
// the account is not an admin. In mock mode (?mock=1) the sign-in is skipped.
import React, { useEffect } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../components/ui";
import { Centered, SignIn, Title } from "../components/SignIn";
import { colors, space } from "../theme/colors";
import { signOut } from "../services/auth";
import { isFirebaseConfigured } from "../services/config";
import { useAuth } from "../store/auth";
import { ADMIN_MOCK } from "./client";
import { useAdmin } from "./store";
import { Muted, Notice } from "./ui";

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const { phase, error, load, reset } = useAdmin();
  const uid = ADMIN_MOCK ? "mock" : user?.uid;

  useEffect(() => {
    if (!uid) { reset(); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (!ADMIN_MOCK) {
    if (!isFirebaseConfigured) return <Centered><Title>Admin dashboard</Title><Notice kind="error">Sign-in isn't set up in this build.</Notice></Centered>;
    if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
    if (!user) return <SignIn heading="Admin sign-in" />;
  }
  if (phase === "idle" || phase === "loading") {
    return <Centered><ActivityIndicator size="large" color={colors.primary} /><Muted style={{ marginTop: space.m, textAlign: "center" }}>Loading…</Muted></Centered>;
  }
  if (phase === "denied") {
    return (
      <Centered>
        <Title>Not an admin account</Title>
        <Text style={{ fontSize: 18, color: colors.ink, marginBottom: space.l }}>This account isn't an admin account.</Text>
        <Muted style={{ marginBottom: space.l }}>Signed in as {user?.email ?? "this account"}. Sign in with the owner account instead.</Muted>
        <Button title="Go to the student area" onPress={() => router.replace("/student")} style={{ marginBottom: space.s }} />
        <Button title="Sign out" variant="ghost" onPress={() => { void signOut(); }} />
      </Centered>
    );
  }
  if (phase === "error") {
    return (
      <Centered>
        <Title>Admin dashboard</Title>
        <Notice kind="error" onRetry={() => void load()}>{error ?? "Something went wrong."}</Notice>
        {ADMIN_MOCK ? null : <Button title="Sign out" variant="ghost" onPress={() => { void signOut(); }} />}
      </Centered>
    );
  }
  return <>{children}</>;
}
