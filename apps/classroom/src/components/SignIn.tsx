// The front door. Parents (default tab): their family code from the teacher. Teachers: email + password or Google.
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card } from "./ui";
import { colors, fonts, space } from "../theme/colors";
import { friendlyAuthError, sendPasswordReset, signInEmail, signInGooglePopup, signInWithFamilyCode } from "../services/auth";
import { friendlyError } from "../services/errors";
import { ApiError } from "../services/api";
import { Field, Muted, Notice, Pill, useAction } from "./dash";

export function Centered({ children, maxWidth = 460 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: space.l }}>
      <Card style={{ width: "100%", maxWidth, alignItems: "stretch" }}>{children}</Card>
    </View>
  );
}
export const Title = ({ children }: { children: string }) => (
  <Text accessibilityRole="header" style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink, marginBottom: space.s }}>{children}</Text>
);

function ParentForm() {
  const [code, setCode] = useState("");
  const { busy, error, run } = useAction();
  const submit = () => { if (code.trim()) void run(async () => { try { await signInWithFamilyCode(code); } catch (e) { throw new Error(e instanceof ApiError ? friendlyError(e) : friendlyAuthError(e)); } }); };
  return (
    <>
      <Muted style={{ marginBottom: space.l }}>Enter the family code your teacher gave you. One code shows all your children.</Muted>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Field label="Family code" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="ABCDE-FGHJK" onSubmitEditing={submit} />
      <Button title={busy ? "Opening…" : "Open"} onPress={submit} disabled={busy || !code.trim()} />
    </>
  );
}

function TeacherForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  const wrap = (fn: () => Promise<unknown>) => run(async () => { try { await fn(); } catch (e) { throw new Error(friendlyAuthError(e)); } });
  const submit = () => { if (email.trim() && password) void wrap(() => signInEmail(email, password)); };
  const forgot = () => { if (email.trim()) void wrap(async () => { await sendPasswordReset(email); setSent(true); }); };
  return (
    <>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {sent ? <Notice kind="good">If that email has a password login, a reset link is on its way.</Notice> : null}
      <Button title="Continue with Google" variant="ghost" onPress={() => void wrap(signInGooglePopup)} disabled={busy} style={{ marginBottom: space.l }} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      <Button title={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy || !email.trim() || !password} />
      <Text onPress={forgot} accessibilityRole="button" style={{ marginTop: space.m, color: email.trim() ? colors.primaryDark : colors.muted, fontFamily: fonts.displayMedium }}>Forgot password?</Text>
    </>
  );
}

export function SignIn({ teacherFirst = false }: { teacherFirst?: boolean }) {
  const [tab, setTab] = useState<"parent" | "teacher">(teacherFirst ? "teacher" : "parent");
  return (
    <Centered>
      <Title>Catapult Classroom</Title>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: space.m }}>
        <Pill label="Parents" selected={tab === "parent"} onPress={() => setTab("parent")} />
        <Pill label="Teachers" selected={tab === "teacher"} onPress={() => setTab("teacher")} />
      </View>
      {tab === "parent" ? <ParentForm /> : <TeacherForm />}
    </Centered>
  );
}
