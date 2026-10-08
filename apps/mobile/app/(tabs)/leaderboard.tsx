// Leaderboard: the race track (you + friends, spaced by this month's stars), then the ranking for Friends / School /
// Global, then Quests (lifetime stars unlock special cat looks).
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { GetLeaderboardResponse, LeaderboardEntry, LeaderboardScope } from "@p6/shared";
import { SHOW_SAMPLES, sampleLeaderboard } from "../../src/dev/samples";
import { useProfile } from "../../src/store/profile";
import { useCosmetics } from "../../src/store/cosmetics";
import { useProgress } from "../../src/store/progress";
import { useFriends } from "../../src/store/friends";
import { catPoses } from "../../src/theme/cats";
import { uiAssets } from "../../src/theme/assets";
import { Body, Button, Chip, H1, H2, Screen } from "../../src/components/ui";
import { CatAvatar } from "../../src/components/CatAvatar";
import { RaceTrack } from "../../src/components/RaceTrack";
import { QuestsCard } from "../../src/components/QuestsCard";
import { api } from "../../src/services/api";
import { colors, fonts, space } from "../../src/theme/colors";

const medalColor = { gold: colors.gold, silver: colors.silver, bronze: colors.bronze } as const;
const topColor = [colors.gold, colors.silver, colors.bronze];
const SCOPES: { id: LeaderboardScope; label: string }[] = [{ id: "friends", label: "Friends" }, { id: "school", label: "School" }, { id: "global", label: "Global" }];
const firstName = (n: string) => n.replace(/\s*\(sample\)$/, "").split(" ")[0];

function Medal({ medal }: { medal?: LeaderboardEntry["medal"] }) {
  if (!medal) return null;
  return (
    <View accessibilityLabel={`${medal} medal last month`} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: medalColor[medal], borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginLeft: 6 }}>
      <Text style={{ fontSize: 12, fontFamily: fonts.display, color: colors.ink }}>★</Text>
    </View>
  );
}

/** The real leaderboard, or (backend not live yet) the sample players with the student's own stars. */
async function loadBoard(scope: LeaderboardScope): Promise<{ data: GetLeaderboardResponse | null; sample: boolean }> {
  try {
    return { data: await api.getLeaderboard({ scope }), sample: false };
  } catch {
    if (!SHOW_SAMPLES) return { data: null, sample: false };
    const prof = useProfile.getState();
    const look = useCosmetics.getState();
    return {
      sample: true,
      data: sampleLeaderboard(scope, {
        uid: prof.uid ?? "me", displayName: prof.fullName || "You", school: prof.school, cat: { colorId: look.colorId, hatId: look.hatId },
        stars: prof.monthlyStars, questionsDone: Object.values(useProgress.getState().grades.P6?.levels ?? {}).filter((l) => l.completed).length * 5,
      }, useFriends.getState().friends),
    };
  }
}

export default function LeaderboardTab() {
  const router = useRouter();
  const [scope, setScope] = useState<LeaderboardScope>("friends");
  const [data, setData] = useState<GetLeaderboardResponse | null>(null);
  const [track, setTrack] = useState<GetLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState(false);
  // Reload when the student's stars, look, school or friends change (e.g. after a level or from Dev Tools).
  const monthlyStars = useProfile((s) => s.monthlyStars);
  const school = useProfile((s) => s.school);
  const look = useCosmetics((s) => `${s.colorId}|${s.hatId}`);
  const friendCount = useFriends((s) => s.friends.length);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [board, friends] = await Promise.all([loadBoard(scope), scope === "friends" ? null : loadBoard("friends")]);
    setData(board.data);
    setTrack((friends ?? board).data);
    setSample(board.sample);
    if (!board.data) setError("Can't load the leaderboard. Check your internet connection.");
    setLoading(false);
  }, [scope, monthlyStars, school, look, friendCount]); // eslint-disable-line react-hooks/exhaustive-deps
  // Debounced: right after sign-in, stars / look / school / friends arrive one by one and would each reload the board.
  useEffect(() => {
    const t = setTimeout(() => void load(), 400);
    return () => clearTimeout(t);
  }, [load]);

  const entries = [...(data?.entries ?? [])].sort((a, b) => a.rank - b.rank);
  const friends = new Set(data?.friendUids ?? []);
  const self = data?.selfUid ?? "";
  const racers = (track?.entries ?? []).map((e) => ({ uid: e.uid, name: firstName(e.displayName), stars: e.stars, cat: e.cat, self: e.uid === track?.selfUid }));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.m }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <H1 style={{ textAlign: "center" }}>Catapult Math Athletes</H1>
        {racers.length ? (
          <View style={{ gap: 6 }}>
            <RaceTrack racers={racers} />
            <Text style={{ color: colors.inkSoft, fontSize: 12, textAlign: "center" }}>
              {racers.length > 1 ? "You and your friends, spaced by stars this month. Most stars on the right. Swipe to see everyone." : "Add friends in Profile to race them here."}
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: "row" }} accessibilityRole="tablist">
          {SCOPES.map((s) => <Chip key={s.id} label={s.label} selected={scope === s.id} onPress={() => setScope(s.id)} />)}
        </View>

        {sample ? (
          <View style={{ backgroundColor: colors.highlight, borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: 10 }}>
            <Text style={{ fontWeight: "800", color: colors.ink }}>Sample leaderboard: these players are examples until the game is online. Your stars are real.</Text>
          </View>
        ) : null}
        {loading && !data ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : null}
        {error ? (
          <View style={{ alignItems: "center", gap: 8, marginVertical: 12 }}>
            <Image source={catPoses.scared} style={{ width: 120, height: 110 }} resizeMode="contain" />
            <Body style={{ color: colors.bad, fontWeight: "800", textAlign: "center" }}>{error}</Body>
          </View>
        ) : null}

        {scope === "school" && !school.trim() ? (
          <View style={{ gap: 8, alignItems: "center" }}>
            <Body style={{ color: colors.inkSoft, textAlign: "center" }}>Add your school in Profile to see everyone from your school.</Body>
            <Button title="Go to Profile" small variant="ghost" onPress={() => router.push("/(tabs)/profile")} />
          </View>
        ) : data && entries.length <= 1 && scope === "friends" ? (
          <Body style={{ color: colors.inkSoft }}>Add friends from the Profile tab to race them!</Body>
        ) : null}

        {entries.length && !(scope === "school" && !school.trim()) ? (
          <View style={{ borderWidth: 3, borderColor: colors.border, borderRadius: 16, overflow: "hidden", backgroundColor: colors.card }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 10, backgroundColor: colors.ink }}>
              <Text style={{ width: 40, color: "#fff", fontFamily: fonts.display, textAlign: "center" }}>#</Text>
              <Text style={{ flex: 1, color: "#fff", fontFamily: fonts.display, marginLeft: 46 }}>{scope === "school" ? school : scope === "friends" ? "Friends" : "Everyone"}</Text>
              <Text style={{ width: 64, color: "#fff", fontFamily: fonts.display, textAlign: "right" }}>Stars</Text>
            </View>
            {entries.map((e, idx) => {
              const isSelf = e.uid === self;
              const isFriend = friends.has(e.uid);
              return (
                <View key={e.uid} accessible accessibilityLabel={`Rank ${e.rank}, ${e.displayName}, ${e.stars} stars${isSelf ? ", you" : isFriend ? ", friend" : ""}`}
                  style={{ flexDirection: "row", alignItems: "center", minHeight: 58, paddingHorizontal: 10, borderTopWidth: idx ? 1 : 0, borderTopColor: "#e3e6f0", borderLeftWidth: 6, borderLeftColor: isSelf ? colors.primary : "transparent", backgroundColor: isSelf ? colors.highlight : isFriend && scope !== "friends" ? colors.friend : colors.card }}>
                  <View style={{ width: 40, alignItems: "center" }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: e.rank <= 3 ? topColor[e.rank - 1] : "#eef0f5", borderWidth: 2, borderColor: e.rank <= 3 ? colors.border : "#d5d9e6" }}>
                      <Text style={{ fontFamily: fonts.display, fontSize: 15, color: colors.ink }}>{e.rank}</Text>
                    </View>
                  </View>
                  <View style={{ width: 40, alignItems: "center", marginLeft: 6 }}><CatAvatar source={catPoses.cute} colorId={e.cat.colorId} hatId={e.cat.hatId} size={34} /></View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ fontWeight: isSelf || e.rank <= 3 ? "900" : "700", fontSize: 16, color: colors.ink, flexShrink: 1 }} numberOfLines={1}>{e.displayName}</Text>
                      {isSelf ? <View style={{ marginLeft: 6, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ color: "#fff", fontSize: 11, fontFamily: fonts.display }}>(you)</Text></View> : null}
                      <Medal medal={e.medal} />
                    </View>
                    {scope === "global" && e.school ? <Text style={{ fontSize: 12, color: colors.inkSoft }} numberOfLines={1}>{e.school}</Text> : null}
                  </View>
                  <View style={{ width: 64, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
                    <Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.ink }}>{e.stars}</Text>
                    <Image source={uiAssets.icons.star} style={{ width: 18, height: 18, marginLeft: 3 }} />
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
        <Text style={{ color: colors.inkSoft, fontSize: 12 }}>
          Ranking = stars earned this month. Resets at midnight at the end of the last day of the month (00:00 on the 1st, Singapore time). Medals show last month's top 3.
        </Text>

        <QuestsCard />
        <View style={{ gap: 4 }}>
          <H2>How to earn stars</H2>
          <Body style={{ color: colors.inkSoft }}>• Map levels: 1 star for every question you get right on your first try.</Body>
          <Body style={{ color: colors.inkSoft }}>• Playing a level again after earning its stars: 1 star when you finish it.</Body>
          <Body style={{ color: colors.inkSoft }}>• Mini games: 1 star for every new question you get right (none for questions you tried before).</Body>
        </View>
      </ScrollView>
    </Screen>
  );
}
