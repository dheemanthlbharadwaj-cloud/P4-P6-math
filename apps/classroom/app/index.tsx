// Home: sign in, then go to the area this login uses (the last one used here, or the only one it has); a login with
// several areas picks one (and can switch later from any page).
import React, { useEffect } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Centered, SignIn, Title } from "../src/components/SignIn";
import { Button } from "../src/components/ui";
import { useAuth } from "../src/store/auth";
import { signOut } from "../src/services/auth";
import { isFirebaseConfigured } from "../src/services/config";
import { AREAS, areasFor, lastArea, rememberArea, startArea, useRoles, type Area } from "../src/roles/store";
import { MOCK_AREAS } from "../src/roles/mock";
import { Muted, Notice } from "../src/teacher/ui";
import { colors, fonts, radius, space } from "../src/theme/colors";

export default function Home() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const { phase, roles } = useRoles();
  const uid = MOCK_AREAS ? "mock" : user?.uid ?? null;
  const offered = areasFor(phase, roles);
  const settled = phase === "ready" || phase === "unknown";
  const go = (a: Area) => { if (uid) rememberArea(uid, a); router.replace(`/${a}`); };

  useEffect(() => {
    if (!uid || !settled) return;
    const a = startArea(offered, lastArea(uid), phase === "ready");
    if (a) router.replace(`/${a}`);
  }, [uid, settled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!MOCK_AREAS) {
    if (!isFirebaseConfigured) return <Centered><Title>Classroom</Title><Notice kind="error">Sign-in isn't set up in this build.</Notice></Centered>;
    if (!ready) return <Centered><ActivityIndicator size="large" color={colors.primary} /></Centered>;
    if (!user) return <SignIn />;
  }
  if (!settled) return <Centered><ActivityIndicator size="large" color={colors.primary} /><Muted style={{ marginTop: space.m, textAlign: "center" }}>Opening your classroom…</Muted></Centered>;
  return (
    <Centered maxWidth={560}>
      <Title>Where to?</Title>
      <Muted style={{ marginBottom: space.l }}>{MOCK_AREAS ? "Demo data (mock mode)" : `Signed in as ${user?.email ?? "this account"}`}{phase === "unknown" ? ". Pick your area; it checks your access." : ""}</Muted>
      <View style={{ gap: space.m }}>
        {AREAS.filter((a) => offered.includes(a.id)).map((a) => (
          <Pressable key={a.id} onPress={() => go(a.id)} accessibilityRole="button"
            style={({ pressed }) => [{ borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, padding: space.l, backgroundColor: pressed ? colors.friend : colors.card }]}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink }}>{a.label}</Text>
            <Text style={{ fontSize: 15, color: colors.inkSoft, marginTop: 2 }}>{a.blurb}</Text>
          </Pressable>
        ))}
      </View>
      {MOCK_AREAS ? null : <Button title="Sign out" variant="ghost" small style={{ marginTop: space.l }} onPress={() => { void signOut(); }} />}
    </Centered>
  );
}
