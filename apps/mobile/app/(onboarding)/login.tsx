// Step 1: log in / sign up (email+password, Google, Sign in with Apple on iOS).
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Text, TextInput, View } from "react-native";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { Body, Button, H1, Screen } from "../../src/components/ui";
import { Image } from "expo-image";
import { catAnimations } from "../../src/theme/cats";
import { appleAvailable, friendlyAuthError, googleClientIds, signInApple, signInApplePopup, signInEmail, signInGoogleIdToken, signInGoogleNative, signInGooglePopup, signUpEmail } from "../../src/services/auth";
import { isFirebaseConfigured } from "../../src/services/config";
import { useProfile } from "../../src/store/profile";
import { useReferral } from "../../src/store/referral";
import { normalizeFriendCode } from "../../src/logic/friendCode";
import { colors, fonts, radius, space } from "../../src/theme/colors";
import { useLayout } from "../../src/theme/layout";
import { HeroSplit, formColumn } from "../../src/components/HeroSplit";

WebBrowser.maybeCompleteAuthSession();

const input = { minHeight: 52, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 18, backgroundColor: "#fff", marginBottom: 12, color: colors.ink } as const;

export default function Login() {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const { wide, splitScreen } = useLayout();
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [friendCode, setFriendCode] = useState(() => useReferral.getState().pendingCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apple, setApple] = useState(false);
  useEffect(() => { void appleAvailable().then(setApple); }, []);

  // TODO(owner): set EXPO_PUBLIC_GOOGLE_*_CLIENT_ID. Without them the Google button explains what is missing.
  const ids = googleClientIds();
  const web = Platform.OS === "web";
  // Phones need their own platform client id (the web client is refused by Google from an app).
  // Android uses native Google sign-in (web client id as audience; the Android OAuth client is matched by package + SHA-1).
  const android = Platform.OS === "android";
  const googleConfigured = web || (android ? !!(ids.googleWebClientId && ids.googleAndroidClientId) : !!ids.googleIosClientId);
  const [, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: ids.googleWebClientId || "unset",
    iosClientId: ids.googleIosClientId || undefined,
  });
  useEffect(() => {
    if (response?.type === "success") {
      const token = response.params?.id_token;
      if (token) void run(() => signInGoogleIdToken(token));
    }
  }, [response]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    // Sign-up only: keep the friend's code until the new account exists (redeemed in bootstrapServerProfile).
    useReferral.getState().set({ pendingCode: mode === "signup" ? normalizeFriendCode(friendCode) : "" });
    try { await fn(); } catch (e) { setError(friendlyAuthError(e)); } finally { setBusy(false); }
  }

  const submit = () => {
    if (!isFirebaseConfigured) { setError("Sign-in is not available yet because Firebase is not configured (set EXPO_PUBLIC_FIREBASE_* in .env). Use \"Continue as guest\" below to try the app."); return; }
    if (!email.trim()) { setError("Please enter your email."); return; }
    if (password.length < 6) { setError("Password needs at least 6 characters."); return; }
    void run(() => (mode === "signup" ? signUpEmail(email, password) : signInEmail(email, password)));
  };

  const devGuest = !isFirebaseConfigured ? (
    <View style={{ marginTop: space.xl }}>
      <Body style={{ color: colors.inkSoft, fontSize: 14 }}>Developer mode: Firebase keys are not set, so sign-in is unavailable. You can still explore the app offline.</Body>
      <Button title="Continue as guest (dev only)" variant="gold" small onPress={() => useProfile.getState().set({ uid: "guest" })} style={{ marginTop: 8 }} />
    </View>
  ) : null;

  // Wide screens: the cat and the name on the left half, the buttons or the form on the right.
  const hero = (big: boolean) => (
    <View style={{ alignItems: "center" }}>
      <Image source={catAnimations.thinking} style={{ width: big ? 320 : 230, height: big ? 320 : 230 }} contentFit="contain" accessibilityLabel="A cat working on a laptop" />
      <Text style={{ fontSize: big ? 56 : 44, lineHeight: big ? 62 : 50, fontFamily: fonts.display, color: colors.ink, textAlign: "center", marginTop: 4 }} accessibilityRole="header">
        {"Catapult\nMath\nAthletes"}
      </Text>
      <Body style={{ textAlign: "center", color: colors.inkSoft, marginTop: 8, fontSize: big ? 20 : undefined }}>PSLE maths practice with your cat buddy.</Body>
    </View>
  );
  const choice = (
    <View style={{ gap: 12, marginTop: space.xl }}>
      <Button title="Log In" variant="ghost" onPress={() => { setMode("login"); setShowForm(true); }} />
      <Button title="Sign Up" onPress={() => { setMode("signup"); setShowForm(true); }} />
    </View>
  );

  if (!showForm && splitScreen) {
    return (
      <Screen edges={["top", "bottom"]}>
        <HeroSplit hero={hero(true)}>
          <ScrollView contentContainerStyle={{ padding: space.xl, flexGrow: 1, justifyContent: "center" }}>
            <View style={formColumn}>
              <H1 style={{ textAlign: "center" }}>Welcome!</H1>
              {choice}
              {devGuest}
            </View>
          </ScrollView>
        </HeroSplit>
      </Screen>
    );
  }

  if (!showForm) {
    return (
      <Screen edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={[{ padding: space.l, flexGrow: 1, justifyContent: "center" }, wide && formColumn]}>
          {hero(wide)}
          {choice}
          {devGuest}
        </ScrollView>
      </Screen>
    );
  }

  const form = (
    <>
        <View style={{ alignItems: "center", marginBottom: space.l }}>
          {splitScreen ? null : <Image source={catAnimations.thinking} style={{ width: 130, height: 130 }} contentFit="contain" />}
          <H1 style={{ textAlign: "center", marginTop: 4 }}>{mode === "signup" ? "Create your account" : "Welcome back!"}</H1>
        </View>

        <TextInput style={input} value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.muted} autoCapitalize="none" keyboardType="email-address" autoComplete="email" accessibilityLabel="Email" />
        <TextInput style={input} value={password} onChangeText={setPassword} placeholder="Password (6+ characters)" placeholderTextColor={colors.muted} secureTextEntry autoCapitalize="none" accessibilityLabel="Password" />
        {mode === "signup" ? (
          <>
            <TextInput style={[input, { marginBottom: 4 }]} value={friendCode} onChangeText={(t) => setFriendCode(t.toUpperCase())} placeholder="Friend's code (optional)" placeholderTextColor={colors.muted} autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Friend's code (optional)" />
            <Text style={{ color: colors.inkSoft, fontSize: 13, fontWeight: "700", marginBottom: 12 }}>Who invited you? You both get stars.</Text>
          </>
        ) : null}
        {error ? <Text style={{ color: colors.bad, fontWeight: "800", marginBottom: 10 }}>{error}</Text> : null}
        <Button title={mode === "signup" ? "Create account" : "Log in"} onPress={submit} disabled={busy} />
        <Button title={mode === "signup" ? "I already have an account" : "I'm new here"} variant="ghost" onPress={() => setMode(mode === "signup" ? "login" : "signup")} style={{ marginTop: 10 }} />

        <Text style={{ textAlign: "center", color: colors.inkSoft, marginVertical: space.l, fontWeight: "700" }}>or</Text>
        <Button
          title="Continue with Google"
          variant="ghost"
          disabled={busy}
          onPress={() => (!isFirebaseConfigured ? setError("Sign-in is not available yet because Firebase is not configured.")
            : web ? void run(signInGooglePopup)
              : android ? (googleConfigured ? void run(signInGoogleNative) : setError("Google sign-in is not set up in this build. Please use email for now."))
              : googleConfigured ? void promptAsync() : setError("Google sign-in is coming soon in the app. Please use email for now."))}
        />
        {apple ? (
          <Button title="Sign in with Apple" variant="ghost" disabled={busy} onPress={() => void run(web ? signInApplePopup : signInApple)} style={{ marginTop: 10 }} />
        ) : null}
        {busy ? <ActivityIndicator style={{ marginTop: 16 }} color={colors.primary} /> : null}

        <Button title="Back" variant="ghost" small onPress={() => setShowForm(false)} style={{ marginTop: space.l }} />
        {devGuest}
    </>
  );

  if (splitScreen) {
    return (
      <Screen edges={["top", "bottom"]}>
        <HeroSplit hero={hero(true)}>
          <ScrollView contentContainerStyle={{ padding: space.xl, flexGrow: 1, justifyContent: "center" }} keyboardShouldPersistTaps="handled">
            <View style={formColumn}>{form}</View>
          </ScrollView>
        </HeroSplit>
      </Screen>
    );
  }
  return (
    <Screen edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={[{ padding: space.l }, wide && formColumn]} keyboardShouldPersistTaps="handled">
        {form}
      </ScrollView>
    </Screen>
  );
}
