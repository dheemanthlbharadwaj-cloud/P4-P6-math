import React, { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { STORE_ITEMS, type StoreItem } from "@p6/shared";
import { Body, Button, Card, Chip, H1, Screen } from "../../src/components/ui";
import { CatAvatar } from "../../src/components/CatAvatar";
import { Stat } from "../../src/components/TopBar";
import { api } from "../../src/services/api";
import { pushProfile } from "../../src/services/cloudSync";
import { catColors, catPoses } from "../../src/theme/cats";
import { uiAssets } from "../../src/theme/assets";
import { useCosmetics } from "../../src/store/cosmetics";
import { useProfile } from "../../src/store/profile";
import { pendingStarEstimate, useOfflineQueue } from "../../src/store/queue";
import { colors, radius, space } from "../../src/theme/colors";

export default function StoreTab() {
  const [kind, setKind] = useState<"color" | "hat">("color");
  const [selected, setSelected] = useState<StoreItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { owned, colorId, hatId } = useCosmetics();
  const stars = useProfile((s) => s.starBalance);
  const pending = useOfflineQueue((s) => pendingStarEstimate(s.items));

  const preview = {
    colorId: selected?.kind === "color" ? selected.id : colorId,
    hatId: selected?.kind === "hat" ? selected.id : hatId,
  };
  const isOwned = !!selected && (owned.includes(selected.id) || selected.price === 0);
  const isEquipped = !!selected && (selected.id === colorId || selected.id === hatId);

  // Equipping is a direct write of users/{uid}.cat; the Firestore rules refuse items the wallet does not own.
  const syncLook = () => { void pushProfile(); };

  const buy = async () => {
    if (!selected) return;
    setBusy(true); setMsg(null);
    try {
      const res = await api.purchaseItem({ itemId: selected.id });
      useProfile.getState().set({ starBalance: res.starBalance });
      useCosmetics.getState().grantOwned(res.ownedItems);
      useCosmetics.getState().equip(selected.id, selected.kind);
      syncLook();
      setMsg(`Bought ${selected.name}!`);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setMsg(/not-signed-in|unavailable|network|deadline/.test(code) ? "Connect to the internet to shop." : code.includes("failed-precondition") ? "Not enough stars yet." : "Could not complete the purchase.");
    } finally { setBusy(false); }
  };

  const equip = () => {
    if (!selected) return;
    useCosmetics.getState().equip(selected.id, selected.kind);
    syncLook();
    setMsg(`${selected.name} equipped.`);
  };

  const items = STORE_ITEMS.filter((i) => i.kind === kind);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <H1>Cat Store</H1>
          <View>
            <Stat icon={uiAssets.icons.star as number} text={String(stars)} tint={colors.highlight} />
            {pending > 0 ? <Text style={{ fontSize: 11, color: colors.inkSoft, textAlign: "right" }}>+{pending} syncing</Text> : null}
          </View>
        </View>

        <Card style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end" }}>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontWeight: "900", color: colors.inkSoft, marginBottom: 4 }}>Now</Text>
            <CatAvatar source={catPoses.cute} colorId={colorId} hatId={hatId} size={130} label="Current look" />
          </View>
          <Text style={{ fontSize: 28, fontWeight: "900", color: colors.inkSoft, marginBottom: 50 }}>›</Text>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontWeight: "900", color: colors.primary, marginBottom: 4 }}>{selected ? "Preview" : "Pick an item"}</Text>
            <CatAvatar source={catPoses.cute} colorId={preview.colorId} hatId={preview.hatId} size={130} label="Preview look" />
          </View>
        </Card>

        <View style={{ flexDirection: "row" }}>
          <Chip label="Colours" selected={kind === "color"} onPress={() => { setKind("color"); setSelected(null); setMsg(null); }} />
          <Chip label="Hats" selected={kind === "hat"} onPress={() => { setKind("hat"); setSelected(null); setMsg(null); }} />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {items.map((it) => {
            const own = owned.includes(it.id) || it.price === 0;
            const eq = it.id === colorId || it.id === hatId;
            const on = selected?.id === it.id;
            return (
              <Pressable key={it.id} onPress={() => { setSelected(it); setMsg(null); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={`${it.name}, ${own ? (eq ? "equipped" : "owned") : `${it.price} stars`}`}
                style={{ width: "30%", flexGrow: 1, minWidth: 96, minHeight: 130, borderRadius: radius.m, borderWidth: 3, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? "#eaf0ff" : colors.card, alignItems: "center", justifyContent: "center", padding: 8 }}>
                {it.kind === "color" ? (
                  <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: catColors[it.id], borderWidth: 3, borderColor: colors.border }} />
                ) : (
                  <Image source={uiAssets.hats[it.id]} style={{ width: 56, height: 56 }} resizeMode="contain" />
                )}
                <Text style={{ fontWeight: "900", color: colors.ink, marginTop: 6, textAlign: "center" }} numberOfLines={1}>{it.name}</Text>
                <Text style={{ fontWeight: "800", color: eq ? colors.good : own ? colors.inkSoft : colors.primaryDark }}>{eq ? "Equipped" : own ? "Owned" : `${it.price} stars`}</Text>
              </Pressable>
            );
          })}
        </View>

        {selected ? (
          <View style={{ gap: 10 }}>
            {isOwned ? (
              <Button title={isEquipped ? "Equipped" : "Equip"} variant="good" onPress={equip} disabled={isEquipped} />
            ) : (
              <Button title={`Buy for ${selected.price} stars`} variant="gold" onPress={buy} disabled={busy || stars < selected.price} />
            )}
            {!isOwned && stars < selected.price ? <Body style={{ color: colors.inkSoft }}>You need {selected.price - stars} more stars. Finish levels to earn them!</Body> : null}
          </View>
        ) : null}
        {kind === "hat" && hatId ? <Button title="Take hat off" variant="ghost" small onPress={() => { useCosmetics.getState().unequipHat(); syncLook(); }} /> : null}
        {msg ? <Text style={{ fontWeight: "800", color: colors.ink, textAlign: "center" }}>{msg}</Text> : null}
      </ScrollView>
    </Screen>
  );
}
