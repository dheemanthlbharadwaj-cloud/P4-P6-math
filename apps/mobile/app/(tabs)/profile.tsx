import React, { useRef, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ENERGY_PER_AD, HEARTS_PER_AD, REFERRAL_STARS, SUBSCRIPTION_PRICE_LABEL } from "@p6/shared";
import { Body, Button, Card, CenterModal, H1, H2, Screen } from "../../src/components/ui";
import { CatAvatar } from "../../src/components/CatAvatar";
import { DateField, isValidIso } from "../../src/components/DateStepper";
import { ParentalGate } from "../../src/components/ParentalGate";
import { SchoolPicker } from "../../src/components/SchoolPicker";
import { Paywall } from "../../src/components/Paywall";
import { FriendRequests } from "../../src/components/FriendRequests";
import { TopBar } from "../../src/components/TopBar";
import { useToast } from "../../src/components/Toast";
import { copyText, openLink, shareText } from "../../src/services/share";
import { api, ApiError } from "../../src/services/api";
import { signOut } from "../../src/services/auth";
import { refreshFriends } from "../../src/services/bootstrap";
import { pushProfile, startCloudSync, stopCloudSync } from "../../src/services/cloudSync";
import { showRewardedAd } from "../../src/services/ads";
import { extra } from "../../src/services/config";
import { catPoses } from "../../src/theme/cats";
import { daysToPsle, useProfile } from "../../src/store/profile";
import { useCosmetics } from "../../src/store/cosmetics";
import { useFriends } from "../../src/store/friends";
import { usePlayer } from "../../src/store/player";
import { resetAllStores } from "../../src/store/reset";
import { colors, fonts, radius, space } from "../../src/theme/colors";

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
  const [parentNote, setParentNote] = useState(false); // "tell a grown-up" notice before the subscription screen
  const [gateOpen, setGateOpen] = useState(false);
  const afterGate = useRef<() => void>(() => undefined);

  const gated = (fn: () => void) => { afterGate.current = fn; setGateOpen(true); };
  const toast = useToast();
  const flash = (m: string) => { setMsg(m); toast.show(m); };

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
    if (!r.rewarded) return flash(r.reason === "dismissed" ? "Watch the whole ad to get the reward." : "No ad available right now. Try again soon.");
    if (kind === "hearts") usePlayer.getState().addHearts(HEARTS_PER_AD); else usePlayer.getState().addEnergy(ENERGY_PER_AD);
    flash(kind === "hearts" ? `+${HEARTS_PER_AD} hearts!` : `+${ENERGY_PER_AD} energy!`);
  };

  const referralLink = `${extra.referralBaseUrl ?? "https://p6math.app/r"}?code=${profile.friendCode}`;
  const share = async () => {
    const r = await shareText(`Join me on Catapult Math Athletes! Use my code ${profile.friendCode}: ${referralLink}`);
    if (r === "copied") flash("Invite link copied. Paste it in a message to your friend.");
    else if (r === "failed") flash(`Couldn't share automatically. Your link: ${referralLink}`);
  };

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
    stopCloudSync();
    if (profile.uid === "guest") profile.set({ uid: null });
    else { try { await signOut(); } catch { /* ignore */ } profile.set({ uid: null }); }
    router.replace("/(onboarding)/login");
  };

  // Delete: type DELETE to confirm (no system dialog, so it works everywhere including the web preview).
  const friendList = useFriends((f) => f.friends);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteAccount = async () => {
    setDeleting(true); setDeleteMsg(null);
    try {
      stopCloudSync(); // no more pushes for an account that is about to disappear
      if (profile.uid && profile.uid !== "guest") await api.deleteAccount();
    } catch (e) {
      startCloudSync();
      setDeleting(false);
      setDeleteMsg(e instanceof ApiError && e.transient ? "You need an internet connection to delete your account." : "Could not delete the account. Please try again later.");
      return;
    }
    try { await signOut(); } catch { /* auth user already removed server-side, or a guest */ }
    resetAllStores();
    setDeleting(false); setDeleteOpen(false); setDeleteText("");
    router.replace("/(onboarding)/login");
  };

  const openUrl = (url: string) => { void openLink(url).then((ok) => { if (!ok) flash(`Couldn't open the link. Visit ${url}`); }); };

  return (
    <Screen>
      <TopBar />
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.l }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <CatAvatar source={catPoses.cute} colorId={colorId} hatId={hatId} size={96} style={{ marginTop: hatId ? 6 : 0 }} />
          <View style={{ flex: 1 }}>
            <H1 style={{ fontSize: 24 }}>{profile.fullName || "Student"}</H1>
            <Body style={{ color: colors.inkSoft }}>{profile.catName ? `with ${profile.catName}` : ""}</Body>
            <Text style={{ fontFamily: fonts.display, color: colors.primary }}>{daysToPsle(profile.psleDate)} days to PSLE</Text>
          </View>
        </View>
        {msg ? <Text style={{ fontFamily: fonts.display, color: colors.ink, backgroundColor: colors.highlight, padding: 10, borderRadius: 12 }} onPress={() => setMsg(null)}>{msg}</Text> : null}

        <Card>
          <H2>My details</H2>
          <TextInput style={[field, { marginTop: 8 }]} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={colors.muted} accessibilityLabel="Full name" />
          <SchoolPicker value={school} onChange={setSchool} />
          <Text style={{ fontWeight: "800", color: colors.inkSoft, marginBottom: 4 }}>PSLE date</Text>
          <DateField value={psle} onChange={setPsle} />
          <Button title="Save changes" variant="good" onPress={save} style={{ marginTop: 12 }} />
        </Card>

        <Card>
          <H2>Friends</H2>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>Your friend code</Body>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 28, fontFamily: fonts.display, letterSpacing: 2, color: colors.ink, flex: 1 }} selectable>{profile.friendCode || "—"}</Text>
            <Button title="Copy" small variant="ghost" disabled={!profile.friendCode} onPress={() => { void copyText(profile.friendCode).then((ok) => flash(ok ? "Code copied." : `Couldn't copy. Your code is ${profile.friendCode}.`)); }} />
          </View>
          <TextInput style={[field, { marginTop: 12 }]} value={friendCode} onChangeText={setFriendCode} autoCapitalize="characters" autoCorrect={false} placeholder="Enter a friend's code" placeholderTextColor={colors.muted} accessibilityLabel="Friend code" />
          <Button title="Send friend request" onPress={addFriend} disabled={friendCode.trim().length < 4} />
        </Card>

        <FriendRequests onMessage={flash} />

        <Card>
          <H2>My friends</H2>
          {friendList.length ? (
            <View style={{ gap: 10, marginTop: 8 }}>
              {friendList.map((f) => (
                <View key={f.uid} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <CatAvatar source={catPoses.cute} colorId={f.cat.colorId} hatId={f.cat.hatId} size={44} style={{ marginTop: f.cat.hatId ? 3 : 0 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.display, color: colors.ink, fontSize: 16 }}>{f.displayName}</Text>
                    <Text style={{ color: colors.inkSoft }}>{f.school ?? ""}{f.school ? " · " : ""}cat: {f.cat.name}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Body style={{ color: colors.inkSoft, marginTop: 6 }}>No friends yet. Share your friend code to add some.</Body>
          )}
        </Card>

        <Card>
          <H2>Invite friends, get {REFERRAL_STARS} stars</H2>
          <Body style={{ color: colors.inkSoft, marginVertical: 6 }}>Share your link. When a friend joins with it you earn {REFERRAL_STARS} stars.</Body>
          <Button title="Share my invite link" variant="gold" onPress={share} disabled={!profile.friendCode} />
          {!profile.friendCode ? <Body style={{ color: colors.inkSoft, marginTop: 6, fontSize: 14 }}>Your friend code appears once you are signed in with an account.</Body> : null}
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
          <Button title={subscribed ? "Manage subscription" : "Subscribe"} variant="gold" onPress={() => setParentNote(true)} />
        </Card>

        <Card>
          <H2>Account</H2>
          <View style={{ gap: 10, marginTop: 8 }}>
            <Button title="Privacy policy" variant="ghost" small onPress={() => openUrl(PRIVACY_URL)} />
            <Button title="Terms of use" variant="ghost" small onPress={() => openUrl(TERMS_URL)} />
            <Button title="Sign out" variant="ghost" onPress={logout} />
            <Button title="Delete account and data" variant="bad" onPress={() => gated(() => { setDeleteText(""); setDeleteMsg(null); setDeleteOpen(true); })} />
          </View>
        </Card>
      </ScrollView>

      <CenterModal visible={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)}>
        <H2 style={{ textAlign: "center" }}>Delete account?</H2>
        <Body style={{ textAlign: "center", color: colors.inkSoft, marginTop: 6 }}>
          This permanently deletes your account, stars, purchases and progress on this device. Type DELETE to confirm.
        </Body>
        <TextInput
          value={deleteText} onChangeText={setDeleteText} placeholder="DELETE" placeholderTextColor={colors.muted}
          autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Type DELETE to confirm"
          style={{ minHeight: 52, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 20, fontFamily: fonts.display, textAlign: "center", backgroundColor: "#fff", color: colors.ink, marginTop: 14 }}
        />
        {deleteMsg ? <Text style={{ color: colors.bad, fontWeight: "800", marginTop: 8, textAlign: "center" }}>{deleteMsg}</Text> : null}
        <Button title={deleting ? "Deleting..." : "Delete everything"} variant="bad" disabled={deleting || deleteText.trim().toUpperCase() !== "DELETE"} onPress={() => void deleteAccount()} style={{ marginTop: 14 }} />
        <Button title="Cancel" variant="ghost" disabled={deleting} onPress={() => setDeleteOpen(false)} style={{ marginTop: 10 }} />
      </CenterModal>
      {toast.node}
      <ParentalGate visible={gateOpen} onCancel={() => setGateOpen(false)} onPass={() => { setGateOpen(false); afterGate.current(); }} />
      <Paywall visible={paywall} onClose={() => setPaywall(false)} />
      <CenterModal visible={parentNote} onClose={() => setParentNote(false)}>
        <H2 style={{ textAlign: "center" }}>Tell a grown-up first</H2>
        <Body style={{ textAlign: "center", marginVertical: 10 }}>
          A subscription costs real money every month. Please let your parent or guardian know before you continue.
        </Body>
        <Button title="OK, I've told them" variant="gold" onPress={() => { setParentNote(false); setPaywall(true); }} />
        <Button title="Not now" variant="ghost" onPress={() => setParentNote(false)} style={{ marginTop: 10 }} />
      </CenterModal>
    </Screen>
  );
}
