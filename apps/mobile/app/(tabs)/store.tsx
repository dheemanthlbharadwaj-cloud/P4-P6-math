import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { QUEST_ITEMS, QUESTS, STORE_ITEMS, type StoreItem } from "@p6/shared";
import { Body, Button, Card, Chip, H1, Screen } from "../../src/components/ui";
import { CatAvatar } from "../../src/components/CatAvatar";
import { Stat } from "../../src/components/TopBar";
import { api } from "../../src/services/api";
import { pushProfile } from "../../src/services/cloudSync";
import { catPoses } from "../../src/theme/cats";
import { uiAssets } from "../../src/theme/assets";
import { useCosmetics } from "../../src/store/cosmetics";
import { useProfile } from "../../src/store/profile";
import { SHOW_SAMPLES } from "../../src/dev/samples";

// Quest rewards appear next to the store items but are never sold: they unlock in Leaderboard → Quests.
type ShopItem = StoreItem & { questStars?: number };
const QUEST_SHOP: ShopItem[] = QUEST_ITEMS.map((i) => ({ ...i, price: 0, questStars: QUESTS.find((q) => q.rewardId === i.id)?.stars }));
import { colors, fonts, radius, space } from "../../src/theme/colors";

export default function StoreTab() {
  const [kind, setKind] = useState<"color" | "hat">("color");
  const [selected, setSelected] = useState<ShopItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { owned, colorId, hatId } = useCosmetics();
  const stars = useProfile((s) => s.starBalance);

  const preview = {
    colorId: selected?.kind === "color" ? selected.id : colorId,
    hatId: selected?.kind === "hat" ? selected.id : hatId,
  };
  const isOwned = !!selected && (owned.includes(selected.id) || (selected.price === 0 && !selected.questStars));
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
      if (SHOW_SAMPLES && /not-signed-in|unavailable|network|deadline|internal|unknown/.test(code) && stars >= selected.price) {
        // Sample mode (backend not live yet): apply the purchase on this device so the store can be tried.
        useProfile.getState().set({ starBalance: stars - selected.price });
        useCosmetics.getState().grantOwned([selected.id]);
        useCosmetics.getState().equip(selected.id, selected.kind);
        setMsg(`Bought ${selected.name}!`);
        return;
      }
      setMsg(/not-signed-in|unavailable|network|deadline/.test(code) ? "Connect to the internet to shop." : code.includes("failed-precondition") ? "Not enough stars yet." : "Could not complete the purchase.");
    } finally { setBusy(false); }
  };

  const equip = () => {
    if (!selected) return;
    useCosmetics.getState().equip(selected.id, selected.kind);
    syncLook();
    setMsg(`${selected.name} equipped.`);
  };

  const items: ShopItem[] = [...STORE_ITEMS, ...QUEST_SHOP].filter((i) => i.kind === kind);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <H1>Cat Store</H1>
          <Stat icon={uiAssets.icons.star as number} text={String(stars)} tint={colors.highlight} />
        </View>

        <Card style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "flex-end" }}>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontFamily: fonts.display, color: colors.inkSoft, marginBottom: 44 }}>Now</Text>
            <CatAvatar source={catPoses.cute} colorId={colorId} hatId={hatId} size={130} label="Current look" />
          </View>
          <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.inkSoft, marginBottom: 50 }}>›</Text>
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontFamily: fonts.display, color: colors.primary, marginBottom: 44 }}>{selected ? "Preview" : "Pick an item"}</Text>
            <CatAvatar source={catPoses.cute} colorId={preview.colorId} hatId={preview.hatId} size={130} label="Preview look" />
          </View>
        </Card>

        <View style={{ flexDirection: "row" }}>
          <Chip label="Colours" selected={kind === "color"} onPress={() => { setKind("color"); setSelected(null); setMsg(null); }} />
          <Chip label="Hats" selected={kind === "hat"} onPress={() => { setKind("hat"); setSelected(null); setMsg(null); }} />
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {items.map((it) => {
            const own = owned.includes(it.id) || (it.price === 0 && !it.questStars);
            const eq = it.id === colorId || it.id === hatId;
            const on = selected?.id === it.id;
            return (
              <Pressable key={it.id} onPress={() => { setSelected(it); setMsg(null); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={`${it.name}, ${own ? (eq ? "equipped" : "owned") : it.questStars ? `quest reward at ${it.questStars} stars` : `${it.price} stars`}`}
                style={{ width: "30%", flexGrow: 1, minWidth: 96, minHeight: 130, borderRadius: radius.m, borderWidth: 3, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? "#e2f6fb" : colors.card, alignItems: "center", justifyContent: "center", padding: 8 }}>
                {/* Each item shown on the student's own cat: colours on the bare cat, hats on the cat in its current colour. */}
                {it.kind === "color" ? (
                  <CatAvatar source={catPoses.cute} colorId={it.id} size={64} />
                ) : (
                  <CatAvatar source={catPoses.cute} colorId={colorId} hatId={it.id} size={64} />
                )}
                <Text style={{ fontFamily: fonts.display, color: colors.ink, marginTop: 6, textAlign: "center" }} numberOfLines={1}>{it.name}</Text>
                <Text style={{ fontWeight: "800", color: eq ? colors.good : own ? colors.inkSoft : colors.primaryDark }}>{eq ? "Equipped" : own ? "Owned" : it.questStars ? `Quest · ${it.questStars}★` : `${it.price} stars`}</Text>
              </Pressable>
            );
          })}
        </View>

        {selected ? (
          <View style={{ gap: 10 }}>
            {isOwned ? (
              <Button title={isEquipped ? "Equipped" : "Equip"} variant="good" onPress={equip} disabled={isEquipped} />
            ) : selected.questStars ? (
              <Body style={{ color: colors.inkSoft, textAlign: "center" }}>Quest reward: earn {selected.questStars} stars in total, then claim it in Leaderboard → Quests.</Body>
            ) : (
              <Button title={`Buy for ${selected.price} stars`} variant="gold" onPress={buy} disabled={busy || stars < selected.price} />
            )}
            {!isOwned && !selected.questStars && stars < selected.price ? <Body style={{ color: colors.inkSoft }}>You need {selected.price - stars} more stars. Finish levels to earn them!</Body> : null}
          </View>
        ) : null}
        {kind === "hat" && hatId ? <Button title="Take hat off" variant="ghost" small onPress={() => { useCosmetics.getState().unequipHat(); syncLook(); }} /> : null}
        {msg ? <Text style={{ fontWeight: "800", color: colors.ink, textAlign: "center" }}>{msg}</Text> : null}
      </ScrollView>
    </Screen>
  );
}
