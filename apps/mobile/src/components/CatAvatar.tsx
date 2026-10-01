// CatAvatar: the ONLY place that knows how cat colour + hat are rendered. Isolated so the artist's coloured
// variants can replace it later (swap `source` per colourId and drop the overlay logic).
// Approach: the pose is black art. We stack (1) the pose tinted to a flat colour (silhouette) and (2) the original
// pose on top at reduced opacity so eyes/outline/shading show through. Black colour = just the pose.
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { catColors, catPoses } from "../theme/cats";
import { uiAssets } from "../theme/assets";

const ASPECT = 512 / 473;
const DETAIL_OPACITY = 0.38;

interface Props {
  source?: ImageSource | number;
  colorId?: string;
  hatId?: string | null;
  size?: number; // width in px
  style?: StyleProp<ViewStyle>;
  label?: string;
}

export function CatAvatar({ source = catPoses.curious, colorId = "color-black", hatId = null, size = 96, style, label }: Props) {
  const tint = catColors[colorId];
  const colored = !!tint && colorId !== "color-black";
  const h = size / ASPECT;
  const hat = hatId ? uiAssets.hats[hatId] : undefined;
  return (
    <View style={[{ width: size, height: h }, style]} accessibilityLabel={label ?? "Your cat"} accessible={!!label}>
      {colored ? (
        <>
          <Image source={source} style={{ position: "absolute", width: size, height: h }} contentFit="contain" tintColor={tint} />
          <Image source={source} style={{ position: "absolute", width: size, height: h, opacity: DETAIL_OPACITY }} contentFit="contain" />
        </>
      ) : (
        <Image source={source} style={{ position: "absolute", width: size, height: h }} contentFit="contain" />
      )}
      {hat ? (
        // Placeholder anchor: top-centre of the pose. Per-pose anchors can be added when the artist's art lands.
        <Image source={hat} style={{ position: "absolute", width: size * 0.5, height: size * 0.5, left: size * 0.25, top: -size * 0.2 }} contentFit="contain" />
      ) : null}
    </View>
  );
}
