// One question figure, bundled or remote. Bundled: RN Image. Remote (a figure the editor changed after the bundle was
// built): expo-image with the disk cache so it also shows offline once seen; if it can't load, the bundled figure.
import React, { useEffect, useState } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { isRemoteFigure, type ShownFigure } from "../content/useFigure";

export function FigureImg({ fig, style, onRatio, label }: {
  fig: ShownFigure; style: StyleProp<ImageStyle>;
  /** width / height of the displayed image, reported when known (remote images load their size) */
  onRatio?: (ratio: number) => void; label?: string;
}) {
  const [failed, setFailed] = useState(false);
  const uri = isRemoteFigure(fig) ? fig.uri : null;
  useEffect(() => setFailed(false), [uri]);
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
  const src = isRemoteFigure(fig) ? fig.fallback : fig;
  if (src === undefined) return null;
  return <Image
      source={src} style={style} resizeMode="contain" accessibilityLabel={label}
      onLoad={onRatio ? (e) => { const { width, height } = e.nativeEvent.source; if (width && height) onRatio(width / height); } : undefined}
    />;
}
