// Everything under /teacher passes through here (any screen size); a teacher signs in with email and
// password (the same Firebase sign-in as students); then teacherGetDashboard decides: permission-denied means the account
// is not a teacher. In mock mode (?mock=1) the sign-in is skipped.
import React, { useEffect } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../components/ui";
import { Centered, SignIn, Title } from "../components/SignIn";
import { colors, space } from "../theme/colors";
import { signOut } from "../services/auth";
import { isFirebaseConfigured } from "../services/config";
import { useAuth } from "../store/auth";
import { TEACHER_MOCK } from "./client";
import { useTeacher } from "./store";
import { Muted, Notice } from "./ui";

export function TeacherGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const { phase, error, load, reset } = useTeacher();
  const uid = TEACHER_MOCK ? "mock" : user?.uid;

  useEffect(() => {
    if (!uid) { reset(); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (!TEACHER_MOCK) {
    if (!isFirebaseConfigured) return <Centered><Title>Teacher dashboard</Title><Notice kind="error">Sign-in isn't set up in this build.</Notice></Centered>;
    if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
    if (!user) return <SignIn heading="Teacher sign-in" />;
  }
  if (phase === "idle" || phase === "loading") {
    return <Centered><ActivityIndicator size="large" color={colors.primary} /><Muted style={{ marginTop: space.m, textAlign: "center" }}>Loading your classes…</Muted></Centered>;
  }
  if (phase === "denied") {
    return (
      <Centered>
        <Title>Not a teacher account</Title>
        <Text style={{ fontSize: 18, color: colors.ink, marginBottom: space.l }}>This account isn't a teacher account.</Text>
        <Muted style={{ marginBottom: space.l }}>Signed in as {user?.email ?? "this account"}. Ask the owner to add you as a teacher, or sign in with a different account.</Muted>
        <Button title="Go to the student area" onPress={() => router.replace("/student")} style={{ marginBottom: space.s }} />
        <Button title="Sign out" variant="ghost" onPress={() => { void signOut(); }} />
      </Centered>
    );
  }
  if (phase === "error") {
    return (
      <Centered>
        <Title>Teacher dashboard</Title>
        <Notice kind="error" onRetry={() => void load()}>{error ?? "Something went wrong."}</Notice>
        {TEACHER_MOCK ? null : <Button title="Sign out" variant="ghost" onPress={() => { void signOut(); }} />}
      </Centered>
    );
  }
  return <>{children}</>;
}
