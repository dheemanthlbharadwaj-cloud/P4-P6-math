// Out-of-hearts pop-up: Watch Ad (rewarded) or Give up / close.
import { Image as ExpoImage } from "expo-image";
import { catAnimations } from "../theme/cats";
import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { HEARTS_PER_AD } from "@p6/shared";
import { Body, Button, CenterModal, H2 } from "./ui";
import { uiAssets } from "../theme/assets";
import { showRewardedAd } from "../services/ads";
import { usePlayer } from "../store/player";
import { colors } from "../theme/colors";

export function ResourceModal({
  visible, onRewarded, onGiveUp, giveUpLabel = "Give up",
}: { visible: boolean; onRewarded: () => void; onGiveUp: () => void; giveUpLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const watch = async () => {
    setBusy(true); setMsg(null);
    const r = await showRewardedAd();
    setBusy(false);
    if (r.rewarded) {
      usePlayer.getState().addHearts(HEARTS_PER_AD);
      onRewarded();
    } else {
      setMsg(r.reason === "dismissed" ? "Watch the whole ad to get the reward." : "No ad available right now. Try again in a moment.");
    }
  };

  return (
    <CenterModal visible={visible}>
      <View style={{ alignItems: "center" }}>
        <ExpoImage source={catAnimations.sad} style={{ width: 140, height: 120 }} contentFit="contain" />
        <Image source={uiAssets.icons.heart} style={{ width: 44, height: 44, marginTop: -10 }} />
        <H2 style={{ marginTop: 8 }}>Out of hearts!</H2>
        <Body style={{ textAlign: "center", marginVertical: 8 }}>
          Watch a short ad to get +{HEARTS_PER_AD} hearts, or give up this level. They refill at midnight.
        </Body>
        {msg ? <Text style={{ color: colors.bad, fontWeight: "700", marginBottom: 6 }}>{msg}</Text> : null}
      </View>
      <Button title={busy ? "Loading ad..." : `Watch Ad (+${HEARTS_PER_AD})`} variant="good" onPress={watch} disabled={busy} />
      <Button title={giveUpLabel} variant="ghost" onPress={onGiveUp} disabled={busy} style={{ marginTop: 10 }} />
    </CenterModal>
  );
}
