// The leaderboard's race track: the student and their friends as cats on a track, spaced by this month's stars
// (left = fewest, right = most). About 5 cats show at once; swipe sideways for the rest. Opens on the student's cat.
import React, { useEffect, useRef, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import type { CatLook } from "@p6/shared";
import { CatAvatar } from "./CatAvatar";
import { layoutTrack } from "../logic/raceTrack";
import { catPoses } from "../theme/cats";
import { uiAssets } from "../theme/assets";
import { colors, fonts } from "../theme/colors";

export interface TrackRacer { uid: string; name: string; stars: number; cat: CatLook; self?: boolean }

const CAT = 56; // cat width
const LANE = 64; // vertical step between lanes
const LABEL = 34;

export function RaceTrack({ racers }: { racers: TrackRacer[] }) {
  const [w, setW] = useState(0);
  const ref = useRef<ScrollView>(null);
  const { placed, width, lanes } = layoutTrack(racers, w || 1, CAT);
  const byUid = new Map(racers.map((r) => [r.uid, r]));
  const me = placed.find((p) => byUid.get(p.uid)?.self);
  const catH = CAT / (512 / 473);
  const height = lanes * LANE + catH + LABEL + 24;

  useEffect(() => {
    if (!w || !me) return;
    const t = setTimeout(() => ref.current?.scrollTo({ x: Math.max(0, me.x - w / 2), animated: false }), 50);
    return () => clearTimeout(t);
  }, [w, me?.x]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ borderWidth: 3, borderColor: colors.border, borderRadius: 16, overflow: "hidden", backgroundColor: "#dff4fb" }}>
      {w ? (
        <ScrollView ref={ref} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ width, height }}>
          {/* The track: a grass strip with one dashed lane line per lane (cats with close scores run in the next lane). */}
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: (lanes - 1) * LANE + LABEL + 22, backgroundColor: "#bfe7a6", borderTopWidth: 3, borderTopColor: "#7fbf5f" }} />
          {Array.from({ length: lanes }, (_, lane) => (
            <View key={lane} style={{ position: "absolute", left: 8, right: 8, bottom: LABEL + 8 + lane * LANE, flexDirection: "row", justifyContent: "space-between" }}>
              {Array.from({ length: Math.max(2, Math.floor(width / 22)) }, (_, i) => <View key={i} style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.95)" }} />)}
            </View>
          ))}
          {placed.map((p) => {
            const r = byUid.get(p.uid)!;
            return (
              <View key={p.uid} accessible accessibilityLabel={`${r.self ? "You" : r.name}, ${r.stars} stars`}
                style={{ position: "absolute", left: p.x - 45, width: 90, bottom: 22 + p.lane * LANE, alignItems: "center" }}>
                <CatAvatar source={catPoses.cute} colorId={r.cat.colorId} hatId={r.cat.hatId} size={CAT} />
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 1, paddingHorizontal: 5, borderRadius: 8, backgroundColor: r.self ? colors.primary : "rgba(255,255,255,0.92)", borderWidth: 1.5, borderColor: colors.border }}>
                  <Text numberOfLines={1} style={{ maxWidth: 52, fontSize: 11, fontFamily: fonts.display, color: r.self ? "#fff" : colors.ink }}>{r.self ? "You" : r.name}</Text>
                  <Image source={uiAssets.icons.star} style={{ width: 11, height: 11, marginLeft: 3 }} />
                  <Text style={{ fontSize: 11, fontFamily: fonts.display, color: r.self ? "#fff" : colors.ink }}>{r.stars}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      ) : <View style={{ height: 150 }} />}
    </View>
  );
}
