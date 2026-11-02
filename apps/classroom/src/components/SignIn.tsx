// One sign-in for everyone (students, teachers, the owner): the same accounts as the Catapult Mathletes game.
// Email + password or Google. No sign-up here: students make their account in the game; teachers get theirs from the
// owner. "Forgot password?" sends Firebase's reset email (for email logins).
import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { Button, Card } from "./ui";
import { colors, fonts, space } from "../theme/colors";
import { friendlyAuthError, sendPasswordReset, signInEmail, signInGooglePopup } from "../services/auth";
import { extra } from "../services/config";
import { Field, Muted, Notice, useAction } from "../teacher/ui";

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

export function SignIn({ heading = "Sign in" }: { heading?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  const wrap = (fn: () => Promise<unknown>) => run(async () => { try { await fn(); } catch (e) { throw new Error(friendlyAuthError(e)); } });
  const submit = () => { if (email.trim() && password) void wrap(() => signInEmail(email, password)); };
  const forgot = () => { if (email.trim()) void wrap(async () => { await sendPasswordReset(email); setSent(true); }); };
  return (
    <Centered>
      <Title>{heading}</Title>
      <Muted style={{ marginBottom: space.l }}>Catapult Mathletes Classroom · use the same account as the game</Muted>
      {error ? <Notice kind="error">{error}</Notice> : null}
      {sent ? <Notice kind="good">If that email has a password login, a reset link is on its way.</Notice> : null}
      <Button title="Continue with Google" variant="ghost" onPress={() => void wrap(signInGooglePopup)} disabled={busy} style={{ marginBottom: space.l }} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      <Button title={busy ? "Signing in…" : "Sign in"} onPress={submit} disabled={busy || !email.trim() || !password} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: space.s, marginTop: space.m }}>
        <Text onPress={forgot} accessibilityRole="button" style={{ color: email.trim() ? colors.primaryDark : colors.muted, fontFamily: fonts.displayMedium }}>Forgot password?</Text>
        <Text onPress={() => void Linking.openURL(extra.gameUrl)} accessibilityRole="link" style={{ color: colors.primaryDark, fontFamily: fonts.displayMedium }}>No account? Make one in the game</Text>
      </View>
    </Centered>
  );
}
