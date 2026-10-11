// A level's stars: one per question, filled when the question has been answered right (beside each level button on
// the map, and on the level's end screen).
import React from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
import { uiAssets } from "../theme/assets";

export function LevelStars({ filled, total = 5, size = 10, style }: { filled: number; total?: number; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", gap: Math.max(1, Math.round(size / 8)) }, style]} accessibilityLabel={`${filled} of ${total} stars`}>
      {Array.from({ length: total }, (_, i) => (
        <Image key={i} source={uiAssets.icons.star} style={{ width: size, height: size, opacity: i < filled ? 1 : 0.55, tintColor: i < filled ? undefined : "#ffffff" }} />
      ))}
    </View>
  );
}
