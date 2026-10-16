// One question figure, bundled or remote. Bundled: RN Image. Remote (a figure the editor changed after the bundle was
// built): expo-image with the disk cache so it also shows offline once seen; if it can't load, the bundled figure.
import React, { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, type ImageStyle, type StyleProp } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { bundledImage, isRemoteFigure, isWebFigure, type ShownFigure } from "../content/useFigure";
import { colors, font, radius } from "../theme/colors";

/** Web: the picture is loading, or did not load (download or decode failed). Never an empty white box. */
function FigureBox({ style, failed, onRetry }: { style: StyleProp<ImageStyle>; failed: boolean; onRetry: () => void }) {
  return (
    <Pressable
      onPress={failed ? onRetry : undefined}
      accessibilityRole={failed ? "button" : "text"}
      accessibilityLabel={failed ? "Picture didn't load. Tap to retry" : "Loading picture"}
      style={[style as object, styles.box]}
    >
      <Text style={styles.boxText}>{failed ? "Picture didn't load \u2014 tap to retry" : "Loading picture\u2026"}</Text>
    </Pressable>
  );
}

export function FigureImg({ fig, style, onRatio, label }: {
  fig: ShownFigure; style: StyleProp<ImageStyle>;
  /** width / height of the displayed image, reported when known (remote images load their size) */
  onRatio?: (ratio: number) => void; label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [broken, setBroken] = useState(false); // web: the bundled picture downloaded but would not display
  const uri = isRemoteFigure(fig) ? fig.uri : null;
  useEffect(() => setFailed(false), [uri]);
  const webImg = isWebFigure(fig) ? fig.img : undefined;
  const webUri = typeof webImg === "object" ? webImg.uri : null;
  useEffect(() => setBroken(false), [webUri]);
  if (isRemoteFigure(fig) && !failed) {
    return (
      <ExpoImage
        source={{ uri: fig.uri }}
        style={style as object}
        contentFit="contain"
        cachePolicy="disk"
        accessibilityLabel={label}
        onLoad={(e) => { const { width, height } = e.source; if (width && height) onRatio?.(width / height); }}
        onError={() => setFailed(true)}
      />
    );
  }
  const web = isWebFigure(fig) ? fig : null;
  if (web && (web.img === undefined || broken)) {
    return <FigureBox style={style} failed={web.failed || broken} onRetry={() => { setBroken(false); web.retry(); }} />;
  }
  const src = bundledImage(fig);
  if (src === undefined) return null;
  return <Image
      source={src} style={style} resizeMode="contain" accessibilityLabel={label}
      onError={web ? () => setBroken(true) : undefined}
      onLoad={onRatio ? (e) => { const { width, height } = e.nativeEvent.source; if (width && height) onRatio(width / height); } : undefined}
    />;
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center", padding: 12, borderWidth: 2, borderStyle: "dashed", borderColor: colors.muted, borderRadius: radius.m, backgroundColor: "#fff" },
  boxText: { color: colors.inkSoft, fontSize: font.body, fontWeight: "700", textAlign: "center" },
});
