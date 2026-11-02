// One question figure (a Cloudinary URL from the figure map, or an edited figure's URL from a live patch). While it
// loads, or when it can't be shown, a dashed box says so ("tap to retry"); never an empty white box.
import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, type ImageStyle, type StyleProp } from "react-native";
import type { ShownFigure } from "../content/useFigure";
import { colors, font, radius } from "../theme/colors";

function FigureBox({ style, failed, onRetry }: { style: StyleProp<ImageStyle>; failed: boolean; onRetry: () => void }) {
  return (
    <Pressable onPress={failed ? onRetry : undefined} accessibilityRole={failed ? "button" : "text"}
      accessibilityLabel={failed ? "Picture didn't load. Tap to retry" : "Loading picture"} style={[style as object, styles.box]}>
      <Text style={styles.boxText}>{failed ? "Picture didn't load — tap to retry" : "Loading picture…"}</Text>
    </Pressable>
  );
}

export function FigureImg({ fig, style, onRatio, onFail, label }: {
  fig: ShownFigure; style: StyleProp<ImageStyle>;
  /** width / height of the picture, reported once it has loaded */
  onRatio?: (ratio: number) => void;
  /** the picture could not be shown */
  onFail?: () => void;
  label?: string;
}) {
  const [broken, setBroken] = useState(false);
  const uri = fig.img?.uri;
  useEffect(() => setBroken(false), [uri]);
  if (!uri || broken) return <FigureBox style={style} failed={fig.failed || broken} onRetry={() => { setBroken(false); fig.retry(); }} />;
  return (
    <Image source={{ uri }} style={style} resizeMode="contain" accessibilityLabel={label} onError={() => { setBroken(true); onFail?.(); }}
      onLoad={onRatio ? (e) => { const { width, height } = e.nativeEvent?.source ?? {}; onRatio(width && height ? width / height : 1); } : undefined} />
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center", padding: 12, borderWidth: 2, borderStyle: "dashed", borderColor: colors.muted, borderRadius: radius.m, backgroundColor: "#fff" },
  boxText: { color: colors.inkSoft, fontSize: font.body, fontWeight: "700", textAlign: "center" },
});
