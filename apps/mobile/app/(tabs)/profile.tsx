import React, { useRef, useState } from "react";
import { Alert, Linking, ScrollView, Share, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { ENERGY_PER_AD, HEARTS_PER_AD, REFERRAL_STARS, SUBSCRIPTION_PRICE_LABEL } from "@p6/shared";
import { Body, Button, Card, H1, H2, Screen } from "../../src/components/ui";
import { CatAvatar } from "../../src/components/CatAvatar";
import { DateField, isValidIso } from "../../src/components/DateStepper";
import { ParentalGate } from "../../src/components/ParentalGate";
import { Paywall } from "../../src/components/Paywall";
import { FriendRequests } from "../../src/components/FriendRequests";
import { TopBar } from "../../src/components/TopBar";
import { api, ApiError } from "../../src/services/api";
import { signOut } from "../../src/services/auth";
import { refreshFriends } from "../../src/services/bootstrap";
import { pushProfile, startCloudSync, stopCloudSync } from "../../src/services/cloudSync";
import { showRewardedAd } from "../../src/services/ads";
import { extra } from "../../src/services/config";
import { catPoses } from "../../src/theme/cats";
import { daysToPsle, useProfile } from "../../src/store/profile";
import { useCosmetics } from "../../src/store/cosmetics";
import { usePlayer } from "../../src/store/player";
import { resetAllStores } from "../../src/store/reset";
import { colors, radius, space } from "../../src/theme/colors";

const PRIVACY_URL = "https://p6math.app/privacy"; // TODO(owner): real URLs
const TERMS_URL = "https://p6math.app/terms";

const field = { minHeight: 52, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 18, backgroundColor: "#fff", color: colors.ink, marginBottom: 10 } as const;

export default function ProfileTab() {
  const router = useRouter();
  const profile = useProfile();
  const { colorId, hatId } = useCosmetics();
  const subscribed = usePlayer((s) => s.subscribed);
  const [name, setName] = useState(profile.fullName);
  const [school, setSchool] = useState(profile.school);
  const [psle, setPsle] = useState(profile.psleDate);
  const [friendCode, setFriendCode] = useState("");
  const [redeem, setRedeem] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [adBusy, setAdBusy] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const afterGate = useRef<() => void>(() => undefined);

  const gated = (fn: () => void) => { afterGate.current = fn; setGateOpen(true); };
  const flash = (m: string) => setMsg(m);

  const save = () => {
    if (!isValidIso(psle)) return flash("PSLE date must look like 2026-10-01.");
    if (!name.trim()) return flash("Please enter your name.");
    profile.set({ fullName: name.trim().slice(0, 60), school: school.trim().slice(0, 80), psleDate: psle });
    void pushProfile(); // users/{uid} (the public profile used by leaderboards follows via the backend trigger)
    flash("Saved!");
  };

  const watch = async (kind: "hearts" | "energy") => {
    setAdBusy(true);
    const r = await showRewardedAd();
    setAdBusy(false);
    if (!r.rewarded) return flash("No ad available right now. Try again soon.");
    if (kind === "hearts") usePlayer.getState().addHearts(HEARTS_PER_AD); else usePlayer.getState().addEnergy(ENERGY_PER_AD);
    flash(kind === "hearts" ? `+${HEARTS_PER_AD} hearts!` : `+${ENERGY_PER_AD} energy!`);
  };

  const referralLink = `${extra.referralBaseUrl ?? "https://p6math.app/r"}?code=${profile.friendCode}`;
  const share = () => Share.share({ message: `Join me on Catapult Math Athletes! Use my code ${profile.friendCode}: ${referralLink}` }).catch(() => undefined);

  const addFriend = async () => {
    try {
      const r = await api.sendFriendRequest({ friendCode: friendCode.trim().toUpperCase() });
      flash(r.status === "accepted" ? "You're friends now!" : "Friend request sent!");
      setFriendCode("");
      if (r.status === "accepted") void refreshFriends();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      flash(e instanceof ApiError && e.transient ? "Connect to the internet to add friends."
        : code === "already-exists" ? "You're already friends, or a request is already waiting."
        : "That friend code didn't work.");
    }
  };

  const redeemCode = async () => {
    try {
      const r = await api.redeemReferral({ friendCode: redeem.trim().toUpperCase() });
      flash(`Code accepted. Your friend earned ${r.starsAwarded} stars, and you are friends now!`);
      setRedeem("");
      void refreshFriends();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      flash(e instanceof ApiError && e.transient ? "Connect to the internet to redeem."
        : code === "already-exists" ? "You already used an invite code."
        : "That code didn't work.");
    }
  };

  const logout = async () => {
    if (profile.uid === "guest") profile.set({ uid: null });
    else { try { await signOut(); } catch { /* ignore */ } }
  };

  const confirmDelete = () =>
    Alert.alert("Delete account?", "This permanently deletes your account, stars, purchases and progress. It cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete everything", style: "destructive",
        onPress: async () => {
          try {
            stopCloudSync(); // no more pushes for an account that is about to disappear
            if (profile.uid !== "guest") await api.deleteAccount();
          } catch (e) {
            startCloudSync();
            Alert.alert("Could not delete", e instanceof ApiError && e.transient ? "You need an internet connection to delete your account." : "Please try again later.");
            return;
          }
          try { await signOut(); } catch { /* auth user already removed server-side */ }
          resetAllStores();
          router.replace("/(onboarding)/login");
        },
      },
    ]);

  const openUrl = (url: string) => gated(() => { void Linking.openURL(url); });

  return (
    <Screen>
      <TopBar />
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.l }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <CatAvatar source={catPoses.cute} colorId={colorId} hatId={hatId} size={96} />
          <View style={{ flex: 1 }}>
            <H1 style={{ fontSize: 24 }}>{profile.fullName || "Student"}</H1>
            <Body style={{ color: colors.inkSoft }}>{profile.catName ? `with ${profile.catName}` : ""}</Body>
            <Text style={{ fontWeight: "900", color: colors.primary }}>{daysToPsle(profile.psleDate)} days to PSLE</Text>
          </View>
        </View>
        {msg ? <Text style={{ fontWeight: "900", color: colors.ink, backgroundColor: colors.highlight, padding: 10, borderRadius: 12 }} onPress={() => setMsg(null)}>{msg}</Text> : null}

        <Card>
          <H2>My details</H2>
          <TextInput style={[field, { marginTop: 8 }]} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.muted} accessibilityLabel="Full name" />
          <TextInput style={field} value={school} onChangeText={setSchool} placeholder="School" placeholderTextColor={colors.muted} accessibilityLabel="School" />
          <Text style={{ fontWeight: "800", color: colors.inkSoft, marginBottom: 4 }}>PSLE date</Text>
          <DateField value={psle} onChange={setPsle} />
          <Button title="Save changes" variant="good" onPress={save} style={{ marginTop: 12 }} />
        </Card>

        <Card>
          <H2>Friends</H2>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>Your friend code</Body>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: 2, color: colors.ink, flex: 1 }} selectable>{profile.friendCode || "—"}</Text>
            <Button title="Copy" small variant="ghost" disabled={!profile.friendCode} onPress={() => { void Clipboard.setStringAsync(profile.friendCode); flash("Code copied."); }} />
          </View>
          <TextInput style={[field, { marginTop: 12 }]} value={friendCode} onChangeText={setFriendCode} autoCapitalize="characters" autoCorrect={false} placeholder="Enter a friend's code" placeholderTextColor={colors.muted} accessibilityLabel="Friend code" />
          <Button title="Send friend request" onPress={addFriend} disabled={friendCode.trim().length < 4} />
        </Card>

        <FriendRequests onMessage={flash} />

        <Card>
          <H2>Invite friends, get {REFERRAL_STARS} stars</H2>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>Share your link. When a friend joins with it you earn {REFERRAL_STARS} stars.</Body>
          <Button title="Share my invite link" variant="gold" onPress={share} disabled={!profile.friendCode} />
          <TextInput style={[field, { marginTop: 12 }]} value={redeem} onChangeText={setRedeem} autoCapitalize="characters" autoCorrect={false} placeholder="Got a friend's invite code?" placeholderTextColor={colors.muted} accessibilityLabel="Invite code" />
          <Button title="Redeem code" variant="ghost" onPress={redeemCode} disabled={redeem.trim().length < 4} />
        </Card>

        <Card>
          <H2>Free boosts</H2>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>Watch a short ad (suitable for children) for a boost.</Body>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button title={`+${HEARTS_PER_AD} Hearts`} onPress={() => watch("hearts")} disabled={adBusy || subscribed} style={{ flex: 1 }} />
            <Button title={`+${ENERGY_PER_AD} Energy`} onPress={() => watch("energy")} disabled={adBusy || subscribed} style={{ flex: 1 }} />
          </View>
        </Card>

        <Card>
          <H2>Unlimited hearts and energy</H2>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>{subscribed ? "You are subscribed. Thank you!" : `Subscribe for ${SUBSCRIPTION_PRICE_LABEL}.`}</Body>
          <Button title={subscribed ? "Manage subscription" : "Subscribe"} variant="gold" onPress={() => gated(() => setPaywall(true))} />
        </Card>

        <Card>
          <H2>Account</H2>
          <View style={{ gap: 10, marginTop: 8 }}>
            <Button title="Privacy policy" variant="ghost" small onPress={() => openUrl(PRIVACY_URL)} />
            <Button title="Terms of use" variant="ghost" small onPress={() => openUrl(TERMS_URL)} />
            <Button title="Sign out" variant="ghost" onPress={logout} />
            <Button title="Delete account and data" variant="bad" onPress={() => gated(confirmDelete)} />
          </View>
        </Card>
      </ScrollView>

      <ParentalGate visible={gateOpen} onCancel={() => setGateOpen(false)} onPass={() => { setGateOpen(false); afterGate.current(); }} />
      <Paywall visible={paywall} onClose={() => setPaywall(false)} />
    </Screen>
  );
}
