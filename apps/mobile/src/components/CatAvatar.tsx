// CatAvatar: the ONLY place that knows how cat colour + hat are rendered.
// Approach: the pose is black art. We stack (1) the pose tinted to a flat colour (silhouette) and (2) the original
// pose on top at reduced opacity so eyes/outline/shading show through. Black colour = just the pose.
import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageSource } from "expo-image";
import { catColors, catColorVariants, catPoses } from "../theme/cats";
import { uiAssets } from "../theme/assets";

const ASPECT = 512 / 473;
const DETAIL_OPACITY = 0.38;

// Where a hat goes, measured from the art: head centre x and head top y (fractions of the pose image), and head size
// relative to the front-facing cat. Poses without an entry fall back to the front-facing cat when a hat is worn.
interface Anchor { cx: number; top: number; scale: number }
const POSE_ANCHORS = new Map<unknown, Anchor>([
  [catPoses.cute, { cx: 0.525, top: 0.25, scale: 1 }],
  [catPoses.chasing, { cx: 0.47, top: 0.63, scale: 0.62 }],
]);
// Per hat (images trimmed to their edges): width as a fraction of the cat's width, image aspect (w/h), and how much
// of the hat's height sinks onto the head.
const HAT_FIT: Record<string, { w: number; aspect: number; sink: number }> = {
  "hat-cap": { w: 0.5, aspect: 1.515, sink: 0.4 },
  "hat-crown": { w: 0.42, aspect: 1.225, sink: 0.22 },
  "hat-wizard": { w: 0.62, aspect: 2.265, sink: 0.3 },
  "hat-grad": { w: 0.5, aspect: 1.143, sink: 0.32 },
};

interface Props {
  source?: ImageSource | number;
  colorId?: string;
  hatId?: string | null;
  size?: number; // width in px
  style?: StyleProp<ViewStyle>;
  label?: string;
}

export function CatAvatar({ source: requested = catPoses.cute, colorId = "color-black", hatId = null, size = 96, style, label }: Props) {
  const tint = catColors[colorId];
  const h = size / ASPECT;
  const hat = hatId ? uiAssets.hats[hatId] : undefined;
  const source = hat && !POSE_ANCHORS.has(requested) ? catPoses.cute : requested;
  const anchor = POSE_ANCHORS.get(source) ?? POSE_ANCHORS.get(catPoses.cute)!;
  const fit = hatId ? HAT_FIT[hatId] ?? { w: 0.5, aspect: 1.3, sink: 0.3 } : null;
  const hatW = fit ? size * fit.w * anchor.scale : 0;
  const hatH = fit ? hatW / fit.aspect : 0;
  const variant = colorId !== "color-black" ? catColorVariants.get(source as number)?.[colorId] : undefined;
  const colored = !variant && !!tint && colorId !== "color-black";
  return (
    <View style={[{ width: size, height: h }, style]} accessibilityLabel={label ?? "Your cat"} accessible={!!label}>
      {colored ? (
        <>
          <Image source={source} style={{ position: "absolute", width: size, height: h }} contentFit="contain" tintColor={tint} />
          <Image source={source} style={{ position: "absolute", width: size, height: h, opacity: DETAIL_OPACITY }} contentFit="contain" />
        </>
      ) : (
        <Image source={variant ?? source} style={{ position: "absolute", width: size, height: h }} contentFit="contain" />
      )}
      {hat && fit ? (
        <Image
          source={hat}
          style={{ position: "absolute", width: hatW, height: hatH, left: anchor.cx * size - hatW / 2, top: anchor.top * h - hatH * (1 - fit.sink) }}
          contentFit="contain"
        />
      ) : null}
    </View>
  );
}
