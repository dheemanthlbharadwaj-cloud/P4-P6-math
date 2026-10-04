import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { MAX_ENERGY, MAX_HEARTS } from "@p6/shared";
import { uiAssets } from "../theme/assets";
import { colors, fonts, radius } from "../theme/colors";
import { useMeters } from "../hooks/useNow";

export function Stat({ icon, text, tint }: { icon: number | { uri: string }; text: string; tint?: string }) {
  return (
    <View style={[styles.stat, tint ? { backgroundColor: tint } : null]}>
      <Image source={icon as never} style={styles.statIcon} />
      <Text style={styles.statText}>{text}</Text>
    </View>
  );
}

/** Hearts and energy (a daily allowance, refilled at midnight). `topic` shows the current map's topic name (map screen). */
export function TopBar({ topic }: { topic?: string }) {
  const m = useMeters();
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Stat icon={uiAssets.icons.heart as number} text={m.subscribed ? "∞" : `${m.hearts}/${MAX_HEARTS}`} />
        <Stat icon={uiAssets.icons.energy as number} text={m.subscribed ? "∞" : `${m.energy}/${MAX_ENERGY}`} />
      </View>
      {topic ? (
        <Text style={styles.topic} numberOfLines={1} accessibilityRole="header">
          {topic}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8, backgroundColor: "rgba(255,248,231,0.92)", borderBottomWidth: 3, borderBottomColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", flexWrap: "wrap" },
  stat: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: radius.m, borderWidth: 2, borderColor: colors.border, paddingHorizontal: 10, minHeight: 44, marginRight: 8 },
  statIcon: { width: 26, height: 26, marginRight: 6 },
  statText: { fontSize: 18, fontFamily: fonts.display, color: colors.ink },
  topic: { fontSize: 24, fontFamily: fonts.display, color: colors.ink, marginTop: 6, textAlign: "center" },
});
