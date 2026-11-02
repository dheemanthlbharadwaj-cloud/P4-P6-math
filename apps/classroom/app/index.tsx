// The front door: parents enter their family code, teachers sign in. Then: parents → /parent; teachers → /teacher (or the
// last staff area used); an admin with both areas and no history gets a picker.
import React, { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { Centered, SignIn, Title } from "../src/components/SignIn";
import { Button } from "../src/components/ui";
import { useAuth } from "../src/store/auth";
import { signOut } from "../src/services/auth";
import { isFirebaseConfigured } from "../src/services/config";
import { AREAS, areasFor, isParentUid, lastArea, rememberArea, startArea, useRoles, type Area } from "../src/roles/store";
import { MOCK_MODE } from "../src/roles/mock";
import { Muted, Notice } from "../src/components/dash";
import { colors, fonts, radius, space } from "../src/theme/colors";

export default function Home() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const { phase, roles } = useRoles();
  const parent = isParentUid(user?.uid);
  const uid = MOCK_MODE ? "mock" : user?.uid ?? null;
  const offered = areasFor(phase, roles);
  const settled = phase === "ready" || phase === "unknown";
  const go = (a: Area) => { if (uid) rememberArea(uid, a); router.replace(`/${a}`); };

  useEffect(() => {
    if (!uid || parent || !settled || MOCK_MODE === "parent") return;
    const a = startArea(offered, lastArea(uid), phase === "ready");
    if (a) router.replace(`/${a}`);
  }, [uid, parent, settled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (MOCK_MODE === "parent" || parent) return <Redirect href="/parent" />;
  if (!MOCK_MODE) {
    if (!isFirebaseConfigured) return <Centered><Title>Catapult Classroom</Title><Notice kind="error">Sign-in isn't set up in this build.</Notice></Centered>;
    if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
    if (!user) return <SignIn />;
  }
  if (!settled) return <Centered><ActivityIndicator size="large" color={colors.primary} /><Muted style={{ marginTop: space.m, textAlign: "center" }}>Opening…</Muted></Centered>;
  if (!offered.length) {
    return (
      <Centered>
        <Title>Not a teacher account</Title>
        <Muted style={{ marginBottom: space.l }}>Signed in as {user?.email ?? "this account"}. Parents: sign out and use your family code. Teachers: ask the owner to add you.</Muted>
        <Button title="Sign out" variant="ghost" onPress={() => { void signOut(); }} />
      </Centered>
    );
  }
  return (
    <Centered maxWidth={560}>
      <Title>Where to?</Title>
      <Muted style={{ marginBottom: space.l }}>{MOCK_MODE ? "Demo data (mock mode)" : `Signed in as ${user?.email ?? "this account"}`}</Muted>
      <View style={{ gap: space.m }}>
        {AREAS.filter((a) => offered.includes(a.id)).map((a) => (
          <Pressable key={a.id} onPress={() => go(a.id)} accessibilityRole="button"
            style={({ pressed }) => [{ borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, padding: space.l, backgroundColor: pressed ? colors.friend : colors.card }]}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink }}>{a.label}</Text>
            <Text style={{ fontSize: 15, color: colors.inkSoft, marginTop: 2 }}>{a.blurb}</Text>
          </Pressable>
        ))}
      </View>
      {MOCK_MODE ? null : <Button title="Sign out" variant="ghost" small style={{ marginTop: space.l }} onPress={() => { void signOut(); }} />}
    </Centered>
  );
}
