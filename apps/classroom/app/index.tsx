// The front door: ONE code box (family code for parents, personal access code for teachers and admins). Then: parents →
// /parent; teachers and admins → /teacher (one staff area).
import React, { useEffect } from "react";
import { ActivityIndicator } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Centered, SignIn, Title } from "../src/components/SignIn";
import { Button } from "../src/components/ui";
import { useAuth } from "../src/store/auth";
import { signOut } from "../src/services/auth";
import { isFirebaseConfigured } from "../src/services/config";
import { areasFor, isParentUid, useRoles } from "../src/roles/store";
import { MOCK_MODE } from "../src/roles/mock";
import { Muted, Notice } from "../src/components/dash";
import { colors, space } from "../src/theme/colors";

export default function Home() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const { phase, roles } = useRoles();
  const parent = isParentUid(user?.uid);
  const uid = MOCK_MODE ? "mock" : user?.uid ?? null;
  const offered = areasFor(phase, roles);
  const settled = phase === "ready" || phase === "unknown";

  useEffect(() => {
    if (!uid || parent || !settled || MOCK_MODE === "parent" || !offered.length) return;
    router.replace("/teacher");
  }, [uid, parent, settled, offered.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (MOCK_MODE === "parent" || parent) return <Redirect href="/parent" />;
  if (!MOCK_MODE) {
    if (!isFirebaseConfigured) return <Centered><Title>Catapult Classroom</Title><Notice kind="error">Sign-in isn't set up in this build.</Notice></Centered>;
    if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
    if (!user) return <SignIn />;
  }
  if (!settled || offered.length) return <Centered><ActivityIndicator size="large" color={colors.primary} /><Muted style={{ marginTop: space.m, textAlign: "center" }}>Opening…</Muted></Centered>;
  return (
    <Centered>
      <Title>Not a teacher account</Title>
      <Muted style={{ marginBottom: space.l }}>This code isn't a teacher's. Sign out and try again.</Muted>
      <Button title="Sign out" variant="ghost" onPress={() => { void signOut(); }} />
    </Centered>
  );
}
