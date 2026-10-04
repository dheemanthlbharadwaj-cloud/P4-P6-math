// RevenueCat paywall STUB. Real offerings are loaded via loadPaywall(); falls back to the spec price label.
import React, { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { Body, Button, CenterModal, H2 } from "./ui";
import { uiAssets } from "../theme/assets";
import { loadPaywall, purchaseSubscription, restorePurchases, type PaywallInfo } from "../services/purchases";
import { usePlayer } from "../store/player";
import { colors, fonts } from "../theme/colors";
import { SUBSCRIPTION_PRICE_LABEL } from "@p6/shared";

export function Paywall({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<PaywallInfo>({ priceLabel: SUBSCRIPTION_PRICE_LABEL, available: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const subscribed = usePlayer((s) => s.subscribed);
  useEffect(() => { if (visible) { setMsg(null); void loadPaywall().then(setInfo); } }, [visible]);

  const buy = async () => {
    setBusy(true);
    const r = await purchaseSubscription();
    setBusy(false);
    if (r === "ok") { setMsg("You're subscribed. Enjoy unlimited hearts and energy!"); }
    else if (r === "unavailable") setMsg("Purchases aren't available in this build yet (RevenueCat keys not set).");
  };
  const restore = async () => {
    setBusy(true);
    const ok = await restorePurchases();
    setBusy(false);
    setMsg(ok ? "Subscription restored." : "No active subscription found.");
  };

  return (
    <CenterModal visible={visible} onClose={onClose}>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 14, marginBottom: 6 }}>
        <Image source={uiAssets.icons.heart} style={{ width: 52, height: 52 }} accessibilityIgnoresInvertColors />
        <Image source={uiAssets.icons.energy} style={{ width: 52, height: 52 }} accessibilityIgnoresInvertColors />
      </View>
      <H2 style={{ textAlign: "center" }}>Unlimited hearts and energy</H2>
      <Text style={{ fontSize: 34, fontFamily: fonts.display, color: colors.primary, textAlign: "center", marginVertical: 8 }}>{info.priceLabel}</Text>
      <Body style={{ textAlign: "center" }}>Play as much as you like every day: no daily limit on hearts or energy, and no ads needed. Cancel any time in your store account settings.</Body>
      <Body style={{ textAlign: "center", fontSize: 13, color: colors.inkSoft, marginTop: 8 }}>
        Payment is charged to your App Store / Google Play account and renews monthly until cancelled.
      </Body>
      {msg ? <Text style={{ fontWeight: "800", color: colors.ink, textAlign: "center", marginTop: 8 }}>{msg}</Text> : null}
      <View style={{ gap: 10, marginTop: 14 }}>
        <Button title={subscribed ? "Already subscribed" : "Subscribe"} variant="gold" onPress={buy} disabled={busy || subscribed} />
        <Button title="Restore purchases" variant="ghost" small onPress={restore} disabled={busy} />
        <Button title="Close" variant="ghost" small onPress={onClose} />
      </View>
    </CenterModal>
  );
}
