import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import type { GetLeaderboardResponse, LeaderboardEntry, LeaderboardScope } from "@p6/shared";
import { Body, Chip, H1, H2, Screen } from "../../src/components/ui";
import { RunningTrack } from "../../src/components/RunningTrack";
import { api } from "../../src/services/api";
import { colors, space } from "../../src/theme/colors";

const medalColor = { gold: colors.gold, silver: colors.silver, bronze: colors.bronze } as const;
const topColor = [colors.gold, colors.silver, colors.bronze];

function Medal({ medal }: { medal?: LeaderboardEntry["medal"] }) {
  if (!medal) return null;
  return (
    <View accessibilityLabel={`${medal} medal last month`} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: medalColor[medal], borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginLeft: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "900", color: colors.ink }}>★</Text>
    </View>
  );
}

function Delta({ d }: { d: number }) {
  if (d === 0) return <Text style={{ width: 52, color: colors.inkSoft, fontWeight: "800" }}>–</Text>;
  return <Text style={{ width: 52, fontWeight: "900", color: d > 0 ? colors.good : colors.bad }} accessibilityLabel={`${d > 0 ? "up" : "down"} ${Math.abs(d)}`}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</Text>;
}

export default function LeaderboardTab() {
  const [scope, setScope] = useState<LeaderboardScope>("daily");
  const [data, setData] = useState<GetLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await api.getLeaderboard({ scope })); }
    catch { setData(null); setError("Can't load the leaderboard. Check your internet connection."); }
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

        {loading && !data ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : null}
        {error ? <Body style={{ color: colors.bad, fontWeight: "800" }}>{error}</Body> : null}

        {scope === "daily" && data && entries.length ? (
          <>
            <H2>The race</H2>
            <RunningTrack entries={entries} selfUid={self} />
          </>
        ) : null}

        {data && !entries.length ? <Body style={{ color: colors.inkSoft }}>{scope === "daily" ? "Add friends from the Profile tab to race them!" : "No scores yet this month."}</Body> : null}

        {entries.length ? (
          <View style={{ borderWidth: 3, borderColor: colors.border, borderRadius: 16, overflow: "hidden", backgroundColor: colors.card }}>
            <View style={{ flexDirection: "row", padding: 10, backgroundColor: colors.ink }}>
              <Text style={{ width: 40, color: "#fff", fontWeight: "900" }}>#</Text>
              {scope === "daily" ? <Text style={{ width: 52, color: "#fff", fontWeight: "900" }}>+/-</Text> : null}
              <Text style={{ flex: 1, color: "#fff", fontWeight: "900" }}>Name</Text>
              <Text style={{ width: 64, color: "#fff", fontWeight: "900", textAlign: "right" }}>Stars</Text>
            </View>
            {entries.map((e) => {
              const isSelf = e.uid === self;
              const isFriend = friends.has(e.uid);
              return (
                <View key={e.uid} accessible accessibilityLabel={`Rank ${e.rank}, ${e.displayName}, ${e.stars} stars${isSelf ? ", you" : ""}`}
                  style={{ flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: 10, borderTopWidth: 1, borderTopColor: "#e3e6f0", backgroundColor: isSelf ? colors.highlight : isFriend ? colors.friend : "transparent" }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, marginRight: 8, alignItems: "center", justifyContent: "center", backgroundColor: e.rank <= 3 ? topColor[e.rank - 1] : "transparent" }}>
                    <Text style={{ fontWeight: "900", fontSize: 16, color: colors.ink }}>{e.rank}</Text>
                  </View>
                  {scope === "daily" ? <Delta d={e.rankDelta} /> : null}
                  <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                    <Text style={{ fontWeight: isSelf || e.rank <= 3 ? "900" : "700", fontSize: 16, color: colors.ink, flexShrink: 1 }} numberOfLines={1}>{e.displayName}{isSelf ? " (you)" : ""}</Text>
                    <Medal medal={e.medal} />
                  </View>
                  <Text style={{ width: 64, textAlign: "right", fontWeight: "900", fontSize: 16, color: colors.ink }}>{e.stars}</Text>
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
