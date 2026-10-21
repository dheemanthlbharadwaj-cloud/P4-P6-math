// Everything under /teacher passes through here: phones get a "use a computer" note; a teacher signs in with email and
// password (the same Firebase sign-in as students); then teacherGetDashboard decides: permission-denied means the account
// is not a teacher. In mock mode (?mock=1) the sign-in is skipped.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { Button, Card } from "../components/ui";
import { colors, fonts, space } from "../theme/colors";
import { friendlyAuthError, signInEmail, signOut } from "../services/auth";
import { isFirebaseConfigured } from "../services/config";
import { useAuth } from "../store/auth";
import { TEACHER_MOCK } from "./client";
import { useTeacher } from "./store";
import { Field, Muted, Notice, useAction } from "./ui";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: space.l }}>
      <Card style={{ width: "100%", maxWidth: 440, alignItems: "stretch" }}>{children}</Card>
    </View>
  );
}
const Title = ({ children }: { children: string }) => <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink, marginBottom: space.s }}>{children}</Text>;

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { busy, error, run } = useAction();
  const submit = () => { if (email.trim() && password) void run(async () => { try { await signInEmail(email, password); } catch (e) { throw new Error(friendlyAuthError(e)); } }); };
  return (
    <Centered>
      <Title>Teacher sign-in</Title>
      <Muted style={{ marginBottom: space.l }}>Catapult Math Athletes · classroom dashboard</Muted>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      <Button title={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy || !email.trim() || !password} />
    </Centered>
  );
}

export function TeacherGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { phase, error, load, reset } = useTeacher();
  const uid = TEACHER_MOCK ? "mock" : user?.uid;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!uid) { reset(); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (Platform.OS !== "web") {
    return (
      <Centered>
        <Title>Teacher dashboard</Title>
        <Text style={{ fontSize: 18, color: colors.ink }}>Open the teacher dashboard on a computer.</Text>
        <Muted style={{ marginTop: space.s }}>Go to the web app and add /teacher to the address.</Muted>
      </Centered>
    );
  }
  if (!TEACHER_MOCK) {
    if (!isFirebaseConfigured) return <Centered><Title>Teacher dashboard</Title><Notice kind="error">Sign-in isn't set up in this build.</Notice></Centered>;
    if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
    if (!user) return <SignIn />;
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
