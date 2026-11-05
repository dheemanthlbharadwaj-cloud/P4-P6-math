// Everything under /teacher: a teacher or admin login (access code). Parents are sent to /parent and never see any of
// this. teacherGetStudents decides: permission-denied = not a teacher account. ?mock=1 skips the sign-in.
import React, { useEffect } from "react";
import { ActivityIndicator, Text } from "react-native";
import { Redirect } from "expo-router";
import { Button } from "../components/ui";
import { Centered, SignIn, Title } from "../components/SignIn";
import { Muted, Notice } from "../components/dash";
import { colors, space } from "../theme/colors";
import { signOut } from "../services/auth";
import { isFirebaseConfigured } from "../services/config";
import { useAuth } from "../store/auth";
import { MOCK_AREAS } from "../roles/mock";
import { isParentUid } from "../roles/logic";
import { useTeacher } from "./store";

export function TeacherGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { phase, error, load, reset } = useTeacher();
  const parent = isParentUid(user?.uid);
  const uid = MOCK_AREAS ? "mock" : parent ? undefined : user?.uid;
  useEffect(() => {
    if (!uid) { reset(); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (!MOCK_AREAS) {
    if (!isFirebaseConfigured) return <Centered><Title>Catapult Classroom</Title><Notice kind="error">Sign-in isn't set up in this build.</Notice></Centered>;
    if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
    if (!user) return <SignIn />;
    if (parent) return <Redirect href="/parent" />;
  }
  if (phase === "idle" || phase === "loading") {
    return <Centered><ActivityIndicator size="large" color={colors.primary} /><Muted style={{ marginTop: space.m, textAlign: "center" }}>Loading your students and lessons…</Muted></Centered>;
  }
  if (phase === "denied") {
    return (
      <Centered>
        <Title>Not a teacher account</Title>
        <Text style={{ fontSize: 18, color: colors.ink, marginBottom: space.l }}>This account isn't a teacher account.</Text>
        <Muted style={{ marginBottom: space.l }}>This code isn't a teacher's. Sign out and try again.</Muted>
        <Button title="Sign out" variant="ghost" onPress={() => { void signOut(); }} />
      </Centered>
    );
  }
  if (phase === "error") {
    return (
      <Centered>
        <Title>Catapult Classroom</Title>
        <Notice kind="error" onRetry={() => void load()}>{error ?? "Something went wrong."}</Notice>
        {MOCK_AREAS ? null : <Button title="Sign out" variant="ghost" onPress={() => { void signOut(); }} />}
      </Centered>
    );
  }
  return <>{children}</>;
}
