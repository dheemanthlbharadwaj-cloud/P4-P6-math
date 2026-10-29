// Everything under /admin passes through here: phones get a "use a computer" note; the owner signs in with email and
// password (the same Firebase sign-in as students and teachers); then adminGetOverview decides: permission-denied means
// the account is not an admin. In mock mode (?mock=1) the sign-in is skipped.
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { Button, Card } from "../components/ui";
import { colors, fonts, space } from "../theme/colors";
import { friendlyAuthError, signInEmail, signOut } from "../services/auth";
import { isFirebaseConfigured } from "../services/config";
import { useAuth } from "../store/auth";
import { ADMIN_MOCK } from "./client";
import { useAdmin } from "./store";
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
      <Title>Admin sign-in</Title>
      <Muted style={{ marginBottom: space.l }}>Catapult Mathletes · owner dashboard</Muted>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      <Button title={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy || !email.trim() || !password} />
    </Centered>
  );
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const { phase, error, load, reset } = useAdmin();
  const uid = ADMIN_MOCK ? "mock" : user?.uid;

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!uid) { reset(); return; }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (Platform.OS !== "web") {
    return (
      <Centered>
        <Title>Admin dashboard</Title>
        <Text style={{ fontSize: 18, color: colors.ink }}>Open the admin dashboard on a computer.</Text>
        <Muted style={{ marginTop: space.s }}>Go to the web app and add /admin to the address.</Muted>
      </Centered>
    );
  }
  if (!ADMIN_MOCK) {
    if (!isFirebaseConfigured) return <Centered><Title>Admin dashboard</Title><Notice kind="error">Sign-in isn't set up in this build.</Notice></Centered>;
    if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
    if (!user) return <SignIn />;
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
