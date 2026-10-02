import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { catAspect, catMoodImage, type CatMood } from "../theme/cats";
import { useCosmetics } from "../store/cosmetics";
import { CatAvatar } from "./CatAvatar";
import { colors, radius } from "../theme/colors";

/** The in-app "desktop pet": reacts to answers using the artist's animations (colour from the store). */
export function CatCompanion({ mood, size = 96, message, floating = false }: { mood: CatMood; size?: number; message?: string; floating?: boolean }) {
  const colorId = useCosmetics((s) => s.colorId);
  if (floating) {
    // Speech bubble floats to the left of the cat (does not widen the layout slot, which is exactly `size` wide).
    // Every mood's art is fitted into the same slot (size wide, 0.72·size tall), anchored bottom-right.
    const src = catMoodImage(mood);
    const slotH = size * 0.72;
    const w = Math.min(size, slotH * catAspect(src));
    return (
      <View style={{ width: size, height: slotH, alignItems: "flex-end", justifyContent: "flex-end" }} pointerEvents="none">
        {message ? (
          <View style={[styles.bubble, { position: "absolute", right: size - 8, top: size * 0.3, marginRight: 0, marginBottom: 0, maxWidth: 150 }]}>
            <Text style={styles.bubbleText} numberOfLines={2}>{message}</Text>
          </View>
        ) : null}
        <CatAvatar source={src} colorId={colorId} size={w} label={`Cat is ${mood}`} />
      </View>
    );
  }
  return (
    <View style={styles.row}>
      {message ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{message}</Text>
        </View>
      ) : null}
      <CatAvatar source={catMoodImage(mood)} colorId={colorId} size={size} label={`Cat is ${mood}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end" },
  bubble: { backgroundColor: colors.card, borderRadius: radius.m, borderWidth: 2, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6, marginBottom: 20, maxWidth: 170 },
  bubbleText: { color: colors.ink, fontWeight: "700", fontSize: 14 },
});
