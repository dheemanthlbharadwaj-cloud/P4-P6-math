// Quests (under the leaderboard): lifetime stars unlock quest-only looks for the cat (25, 50, 75, 100, 150, 200 stars).
// A reached quest shows "Claim"; a claimed one can be equipped here or in the Cat Store.
import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { QUEST_ITEMS, QUESTS, questState } from "@p6/shared";
import { Button, Card, H2 } from "./ui";
import { CatAvatar } from "./CatAvatar";
import { api } from "../services/api";
import { pushProfile } from "../services/cloudSync";
import { useStars } from "../store/stars";
import { useCosmetics } from "../store/cosmetics";
import { catPoses } from "../theme/cats";
import { uiAssets } from "../theme/assets";
import { colors, fonts } from "../theme/colors";

export function QuestsCard() {
  const total = useStars((s) => s.totalStars);
  const claimed = useStars((s) => s.claimedQuests);
  const { colorId, hatId } = useCosmetics();
  const [msg, setMsg] = useState<string | null>(null);

  const claim = (questId: string) => {
    const reward = useStars.getState().claimQuest(questId);
    if (!reward) return;
    const item = QUEST_ITEMS.find((i) => i.id === reward)!;
    setMsg(`${item.name} unlocked! Equip it below or in the Cat Store.`);
    api.claimQuest({ questId }).catch(() => undefined); // server copy when online; the reward is already yours here
  };
  const equip = (id: string, kind: "hat" | "color") => {
    useCosmetics.getState().equip(id, kind);
    void pushProfile();
  };

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <H2>Quests</H2>
        <View style={{ flexDirection: "row", alignItems: "center" }} accessibilityLabel={`${total} stars earned in total`}>
          <Image source={uiAssets.icons.star} style={{ width: 20, height: 20, marginRight: 4 }} />
          <Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.ink }}>{total} earned</Text>
        </View>
      </View>
      <Text style={{ color: colors.inkSoft, fontWeight: "700" }}>Earn stars to unlock special looks for your cat. They are never sold in the store.</Text>
      {QUESTS.map((q) => {
        const item = QUEST_ITEMS.find((i) => i.id === q.rewardId)!;
        const state = questState(q, total, claimed);
        const worn = item.id === colorId || item.id === hatId;
        const pct = Math.min(1, total / q.stars);
        return (
          <View key={q.id} accessible accessibilityLabel={`${item.name}: ${state === "claimed" ? "unlocked" : state === "ready" ? "ready to claim" : `${Math.min(total, q.stars)} of ${q.stars} stars`}`}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 14, borderWidth: 2, borderColor: state === "ready" ? colors.gold : "#dfe3ee", backgroundColor: state === "ready" ? colors.highlight : colors.card }}>
            <View style={{ width: 64, alignItems: "center", opacity: state === "locked" ? 0.55 : 1 }}>
              {item.kind === "color"
                ? <CatAvatar source={catPoses.cute} colorId={item.id} hatId={null} size={56} />
                : <CatAvatar source={catPoses.cute} colorId={colorId} hatId={item.id} size={56} />}
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 15, color: colors.ink }}>{item.name} {item.kind === "color" ? "skin" : "hat"}</Text>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: "#e6e9f2", overflow: "hidden", borderWidth: 1.5, borderColor: colors.border }}>
                <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: state === "locked" ? colors.primary : colors.good }} />
              </View>
              <Text style={{ fontSize: 12, fontWeight: "800", color: colors.inkSoft }}>{Math.min(total, q.stars)} / {q.stars} stars</Text>
            </View>
            {state === "ready" ? <Button title="Claim" variant="gold" small onPress={() => claim(q.id)} />
              : state === "claimed" ? <Button title={worn ? "Wearing" : "Equip"} variant="good" small disabled={worn} onPress={() => equip(item.id, item.kind)} />
                : <Text style={{ width: 64, textAlign: "center", fontSize: 12, fontWeight: "800", color: colors.inkSoft }}>{q.stars - total} to go</Text>}
          </View>
        );
      })}
      {msg ? <Text style={{ fontWeight: "800", color: colors.good, textAlign: "center" }}>{msg}</Text> : null}
    </Card>
  );
}
