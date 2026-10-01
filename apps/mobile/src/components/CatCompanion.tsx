import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { catMoodImage, type CatMood } from "../theme/cats";
import { useCosmetics } from "../store/cosmetics";
import { CatAvatar } from "./CatAvatar";
import { colors, radius } from "../theme/colors";

/** The in-app "desktop pet": reacts to answers using the artist's animations (colour from the store). */
export function CatCompanion({ mood, size = 96, message }: { mood: CatMood; size?: number; message?: string }) {
  const colorId = useCosmetics((s) => s.colorId);
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
