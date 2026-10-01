// Daily race track: friends' cats on a scrolling track, position ~ questions done today.
// PLACEHOLDER: uses the static "chasing mouse" pose with a bobbing animation until the artist's running GIF arrives
// (swap `runnerSource` below; CatAvatar keeps colour/hat).
import React, { useEffect, useRef } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { LeaderboardEntry } from "@p6/shared";
import { CatAvatar } from "./CatAvatar";
import { catPoses } from "../theme/cats";
import { colors } from "../theme/colors";

const runnerSource = catPoses.chasing; // TODO(artist): replace with the running-cat animation

function Runner({ entry, x, self }: { entry: LeaderboardEntry; x: number; self: boolean }) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -6, duration: 280 + (entry.uid.length % 5) * 40, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 280, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, entry.uid]);
  return (
    <Animated.View style={[styles.runner, { left: x, transform: [{ translateY: bob }] }]} accessible accessibilityLabel={`${entry.displayName}, ${entry.questionsDone} questions`}>
      <CatAvatar source={runnerSource} colorId={entry.cat.colorId} hatId={entry.cat.hatId} size={72} />
      <Text style={[styles.name, self && { backgroundColor: colors.highlight }]} numberOfLines={1}>{entry.displayName}</Text>
      <Text style={styles.count}>{entry.questionsDone} Qs</Text>
    </Animated.View>
  );
}

export function RunningTrack({ entries, selfUid }: { entries: LeaderboardEntry[]; selfUid: string }) {
  const { width } = useWindowDimensions();
  const max = Math.max(1, ...entries.map((e) => e.questionsDone));
  const trackW = Math.max(width, entries.length * 90 + 120);
  const dash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(dash, { toValue: -40, duration: 700, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [dash]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Race track, scroll sideways" style={styles.scroll}>
      <View style={{ width: trackW, height: 160 }}>
        <View style={styles.ground} />
        <View style={styles.dashClip}>
          <Animated.View style={{ flexDirection: "row", transform: [{ translateX: dash }], width: trackW + 80 }}>
            {Array.from({ length: Math.ceil(trackW / 40) + 2 }, (_, i) => <View key={i} style={styles.dash} />)}
          </Animated.View>
        </View>
        <View style={styles.finish} />
        {entries.map((e, i) => {
          const base = 12 + (e.questionsDone / max) * (trackW - 140);
          // stagger identical scores so avatars do not fully overlap
          const stagger = entries.filter((o, j) => j < i && o.questionsDone === e.questionsDone).length * 40;
          return <Runner key={e.uid} entry={e} x={Math.min(trackW - 90, base + stagger)} self={e.uid === selfUid} />;
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { backgroundColor: "#cfeeff", borderRadius: 20, borderWidth: 3, borderColor: colors.border },
  ground: { position: "absolute", left: 0, right: 0, bottom: 0, height: 44, backgroundColor: "#8f9aa8" },
  dashClip: { position: "absolute", left: 0, right: 0, bottom: 20, height: 4, overflow: "hidden" },
  dash: { width: 20, height: 4, marginRight: 20, backgroundColor: "#fff" },
  finish: { position: "absolute", right: 8, bottom: 0, width: 10, height: 120, backgroundColor: colors.ink, opacity: 0.8 },
  runner: { position: "absolute", bottom: 26, width: 84, alignItems: "center" },
  name: { fontSize: 12, fontWeight: "900", color: colors.ink, maxWidth: 84, paddingHorizontal: 4, borderRadius: 6, overflow: "hidden" },
  count: { fontSize: 11, fontWeight: "800", color: colors.inkSoft },
});
