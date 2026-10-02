import React, { useCallback, useEffect, useState } from "react";
import { SHOW_SAMPLES, sampleLeaderboard } from "../../src/dev/samples";
import { useProfile } from "../../src/store/profile";
import { useCosmetics } from "../../src/store/cosmetics";
import { useProgress } from "../../src/store/progress";
import { useFriends } from "../../src/store/friends";
import { catPoses } from "../../src/theme/cats";
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, View } from "react-native";
import type { GetLeaderboardResponse, LeaderboardEntry, LeaderboardScope } from "@p6/shared";
import { Body, Chip, H1, Screen } from "../../src/components/ui";
import { api } from "../../src/services/api";
import { colors, fonts, space } from "../../src/theme/colors";

const medalColor = { gold: colors.gold, silver: colors.silver, bronze: colors.bronze } as const;
const topColor = [colors.gold, colors.silver, colors.bronze];

function Medal({ medal }: { medal?: LeaderboardEntry["medal"] }) {
  if (!medal) return null;
  return (
    <View accessibilityLabel={`${medal} medal last month`} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: medalColor[medal], borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginLeft: 6 }}>
      <Text style={{ fontSize: 12, fontFamily: fonts.display, color: colors.ink }}>★</Text>
    </View>
  );
}

function Delta({ d }: { d: number }) {
  if (d === 0) return <Text style={{ width: 52, textAlign: "center", color: colors.inkSoft, fontWeight: "800" }}>–</Text>;
  return <Text style={{ width: 52, textAlign: "center", fontFamily: fonts.display, color: d > 0 ? colors.good : colors.bad }} accessibilityLabel={`${d > 0 ? "up" : "down"} ${Math.abs(d)}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</Text>;
}

export default function LeaderboardTab() {
  const [scope, setScope] = useState<LeaderboardScope>("daily");
  const [data, setData] = useState<GetLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null); setSample(false);
    try { setData(await api.getLeaderboard({ scope })); }
    catch {
      if (SHOW_SAMPLES) {
        // Backend not reachable yet: show the student with the sample friends so the screen can be tried.
        const prof = useProfile.getState();
        const look = useCosmetics.getState();
        setData(sampleLeaderboard(scope, {
          uid: prof.uid ?? "me", displayName: prof.fullName || "You", cat: { colorId: look.colorId, hatId: look.hatId },
          stars: prof.monthlyStars, questionsDone: Object.values(useProgress.getState().grades.P6?.levels ?? {}).filter((l) => l.completed).length * 5,
        }, useFriends.getState().friends));
        setSample(true);
      } else {
        setData(null); setError("Can't load the leaderboard. Check your internet connection.");
      }
    }
    finally { setLoading(false); }
  }, [scope]);
  useEffect(() => { void load(); }, [load]);

  const entries = [...(data?.entries ?? [])].sort((a, b) => a.rank - b.rank);
  const friends = new Set(data?.friendUids ?? []);
  const self = data?.selfUid ?? "";

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <H1>Leaderboard</H1>
        <View style={{ flexDirection: "row" }}>
          <Chip label="Daily (friends)" selected={scope === "daily"} onPress={() => setScope("daily")} />
          <Chip label="Monthly (global)" selected={scope === "monthly"} onPress={() => setScope("monthly")} />
        </View>

        {sample ? (
          <View style={{ backgroundColor: colors.highlight, borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: 10 }}>
            <Text style={{ fontWeight: "800", color: colors.ink }}>Sample leaderboard: these players are examples until the game is online.</Text>
          </View>
        ) : null}
        {loading && !data ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : null}
        {error ? (
          <View style={{ alignItems: "center", gap: 8, marginVertical: 12 }}>
            <Image source={catPoses.scared} style={{ width: 120, height: 110 }} resizeMode="contain" />
            <Body style={{ color: colors.bad, fontWeight: "800", textAlign: "center" }}>{error}</Body>
          </View>
        ) : null}

        {data && !entries.length ? <Body style={{ color: colors.inkSoft }}>{scope === "daily" ? "Add friends from the Profile tab to race them!" : "No scores yet this month."}</Body> : null}

        {entries.length ? (
          <View style={{ borderWidth: 3, borderColor: colors.border, borderRadius: 16, overflow: "hidden", backgroundColor: colors.card }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 10, backgroundColor: colors.ink }}>
              <Text style={{ width: 40, color: "#fff", fontFamily: fonts.display, textAlign: "center" }}>#</Text>
              {scope === "daily" ? <Text style={{ width: 52, color: "#fff", fontFamily: fonts.display, textAlign: "center" }}>+/-</Text> : null}
              <Text style={{ flex: 1, color: "#fff", fontFamily: fonts.display, marginLeft: 8 }}>Name</Text>
              <Text style={{ width: 64, color: "#fff", fontFamily: fonts.display, textAlign: "right" }}>Stars</Text>
            </View>
            {entries.map((e, idx) => {
              const isSelf = e.uid === self;
              const isFriend = friends.has(e.uid);
              return (
                <View key={e.uid} accessible accessibilityLabel={`Rank ${e.rank}, ${e.displayName}, ${e.stars} stars${isSelf ? ", you" : ""}`}
                  style={{ flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 10, borderTopWidth: idx ? 1 : 0, borderTopColor: "#e3e6f0", borderLeftWidth: 6, borderLeftColor: isSelf ? colors.primary : "transparent", backgroundColor: isSelf ? colors.highlight : isFriend ? colors.friend : colors.card }}>
                  <View style={{ width: 40, alignItems: "center" }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: e.rank <= 3 ? topColor[e.rank - 1] : "#eef0f5", borderWidth: 2, borderColor: e.rank <= 3 ? colors.border : "#d5d9e6" }}>
                      <Text style={{ fontFamily: fonts.display, fontSize: 15, color: colors.ink }}>{e.rank}</Text>
                    </View>
                  </View>
                  {scope === "daily" ? <Delta d={e.rankDelta} /> : null}
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginLeft: 8 }}>
                    <Text style={{ fontWeight: isSelf || e.rank <= 3 ? "900" : "700", fontSize: 16, color: colors.ink, flexShrink: 1 }} numberOfLines={1}>{e.displayName}</Text>
                    {isSelf ? <View style={{ marginLeft: 6, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ color: "#fff", fontSize: 11, fontFamily: fonts.display }}>(you)</Text></View> : null}
                    <Medal medal={e.medal} />
                  </View>
                  <Text style={{ width: 64, textAlign: "right", fontFamily: fonts.display, fontSize: 16, color: colors.ink }}>{e.stars}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
        <Text style={{ color: colors.inkSoft, fontSize: 12 }}>
          {scope === "daily" ? "Refreshed every midnight (Singapore time). Arrows show places gained or lost since yesterday." : "Ranking = stars earned this month. Resets at midnight at the end of the last day of the month (00:00 on the 1st, Singapore time)."}
        </Text>
      </ScrollView>
    </Screen>
  );
}
