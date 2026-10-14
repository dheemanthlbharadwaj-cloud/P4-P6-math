// Daily quests (Leaderboard tab, above Quests): answer 5 / 15 / 25 questions, add a friend. The server counts progress;
// a finished quest is claimed by tapping, the same day. New quests every day at midnight (Singapore time).
import React, { useCallback, useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { DAILY_QUESTS, type DailyQuestState } from "@p6/shared";
import { Button, Card, H2 } from "./ui";
import { api } from "../services/api";
import { applyBalances } from "../services/balances";
import { uiAssets } from "../theme/assets";
import { colors, fonts } from "../theme/colors";

/** `focused` = the tab is on screen; `pending` = offline-queue length (shrinks when a result was accepted). */
export function DailyQuestsCard({ focused, pending }: { focused: boolean; pending: number }) {
  const [quests, setQuests] = useState<DailyQuestState[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getDailyQuests();
      setQuests(res.quests);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);
  useEffect(() => {
    if (!focused) return;
    const t = setTimeout(() => void load(), 400);
    return () => clearTimeout(t);
  }, [focused, pending, load]);

  const claim = async (questId: string) => {
    setBusy(questId); setMsg(null);
    try {
      const r = await api.claimDailyQuest({ questId });
      applyBalances(r);
      setQuests(r.quests);
      setMsg(`+${r.starsAwarded} stars!`);
    } catch {
      setMsg("Couldn't claim right now. Try again.");
      void load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: 10 }}>
      <H2>Daily quests</H2>
      {offline && !quests ? <Text style={{ color: colors.inkSoft, fontWeight: "700", fontSize: 13 }}>Connect to the internet to see today's quests.</Text> : null}
      {(quests ?? []).map((q) => {
        const def = DAILY_QUESTS.find((d) => d.id === q.id);
        const done = q.progress >= q.target;
        const ready = done && !q.claimed;
        const pct = Math.min(1, q.progress / Math.max(1, q.target));
        return (
          <View key={q.id} accessible accessibilityLabel={`${def?.title ?? q.id}: ${q.claimed ? "claimed" : ready ? "ready to claim" : `${q.progress} of ${q.target}`}, ${q.stars} stars`}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 8, borderRadius: 14, borderWidth: 2, borderColor: ready ? colors.gold : "#dfe3ee", backgroundColor: ready ? colors.highlight : colors.card }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 15, color: colors.ink }}>{def?.title ?? q.id}</Text>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: "#e6e9f2", overflow: "hidden", borderWidth: 1.5, borderColor: colors.border }}>
                <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: done ? colors.good : colors.primary }} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: colors.inkSoft }}>{q.progress} / {q.target}</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontFamily: fonts.display, color: colors.ink }}>+{q.stars}</Text>
                  <Image source={uiAssets.icons.star} style={{ width: 16, height: 16, marginLeft: 2 }} />
                </View>
              </View>
            </View>
            {ready ? <Button title="Claim" variant="gold" small disabled={busy !== null} onPress={() => void claim(q.id)} />
              : q.claimed ? <Text style={{ width: 80, textAlign: "center", fontSize: 13, fontWeight: "800", color: colors.good }}>Claimed ✓</Text>
                : null}
          </View>
        );
      })}
      {msg ? <Text style={{ fontWeight: "800", color: colors.good, textAlign: "center" }}>{msg}</Text> : null}
      <Text style={{ color: colors.inkSoft, fontSize: 12 }}>New quests every day at midnight.</Text>
    </Card>
  );
}
