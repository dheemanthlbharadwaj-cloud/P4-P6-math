// Out-of-hearts / out-of-energy pop-up: Watch Ad (rewarded) or Give up / close.
import { Image as ExpoImage } from "expo-image";
import { catAnimations, catPoses } from "../theme/cats";
import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { ENERGY_PER_AD, HEARTS_PER_AD } from "@p6/shared";
import { Body, Button, CenterModal, H2 } from "./ui";
import { uiAssets } from "../theme/assets";
import { showRewardedAd } from "../services/ads";
import { usePlayer } from "../store/player";
import { colors } from "../theme/colors";

export function ResourceModal({
  kind, visible, onRewarded, onGiveUp, giveUpLabel = "Give up",
}: { kind: "hearts" | "energy"; visible: boolean; onRewarded: () => void; onGiveUp: () => void; giveUpLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const amount = kind === "hearts" ? HEARTS_PER_AD : ENERGY_PER_AD;

  const watch = async () => {
    setBusy(true); setMsg(null);
    const r = await showRewardedAd();
    setBusy(false);
    if (r.rewarded) {
      if (kind === "hearts") usePlayer.getState().addHearts(HEARTS_PER_AD);
      else usePlayer.getState().addEnergy(ENERGY_PER_AD);
      onRewarded();
    } else {
      setMsg(r.reason === "dismissed" ? "Watch the whole ad to get the reward." : "No ad available right now. Try again in a moment.");
    }
  };

  return (
    <CenterModal visible={visible}>
      <View style={{ alignItems: "center" }}>
        <ExpoImage source={kind === "hearts" ? catAnimations.sad : catPoses.box} style={{ width: 140, height: 120 }} contentFit="contain" />
        <Image source={kind === "hearts" ? uiAssets.icons.heart : uiAssets.icons.energy} style={{ width: 44, height: 44, marginTop: -10 }} />
        <H2 style={{ marginTop: 8 }}>{kind === "hearts" ? "Out of hearts!" : "Out of energy!"}</H2>
        <Body style={{ textAlign: "center", marginVertical: 8 }}>
          Watch a short ad to get +{amount} {kind}, or {kind === "hearts" ? "give up this level" : "come back later"}. Recovery takes time.
        </Body>
        {msg ? <Text style={{ color: colors.bad, fontWeight: "700", marginBottom: 6 }}>{msg}</Text> : null}
      </View>
      <Button title={busy ? "Loading ad..." : `Watch Ad (+${amount})`} variant="good" onPress={watch} disabled={busy} />
      <Button title={giveUpLabel} variant="ghost" onPress={onGiveUp} disabled={busy} style={{ marginTop: 10 }} />
    </CenterModal>
  );
}
