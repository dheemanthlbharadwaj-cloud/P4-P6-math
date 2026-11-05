// The front door: ONE code box. Parents type their family code, teachers and admins their personal staff access code.
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card } from "./ui";
import { colors, fonts, space } from "../theme/colors";
import { friendlyAuthError, signInWithCode } from "../services/auth";
import { codeKind, normalizeFamilyCode } from "@p6/shared";
import { friendlyError } from "../services/errors";
import { ApiError } from "../services/api";
import { Field, Muted, Notice, useAction } from "./dash";

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

export const BAD_CODE = "That code doesn't look right. Check it with your teacher.";

export function SignIn() {
  const [code, setCode] = useState("");
  const { busy, error, run } = useAction();
  const [bad, setBad] = useState(false);
  const submit = () => {
    if (!code.trim()) return;
    const norm = normalizeFamilyCode(code);
    if (!codeKind(norm)) { setBad(true); return; }
    setBad(false);
    void run(async () => { try { await signInWithCode(norm); } catch (e) { throw new Error(e instanceof ApiError ? friendlyError(e) : friendlyAuthError(e)); } });
  };
  return (
    <Centered>
      <Title>Catapult Classroom</Title>
      <Muted style={{ marginBottom: space.l }}>Enter your code.</Muted>
      {bad ? <Notice kind="error">{BAD_CODE}</Notice> : error ? <Notice kind="error">{error}</Notice> : null}
      <Field label="Your code" value={code} onChangeText={(t) => { setCode(t); setBad(false); }} autoCapitalize="characters" autoCorrect={false} placeholder="ABCDE-FGHJK" onSubmitEditing={submit} />
      <Button title={busy ? "Opening…" : "Open"} onPress={submit} disabled={busy || !code.trim()} />
    </Centered>
  );
}
