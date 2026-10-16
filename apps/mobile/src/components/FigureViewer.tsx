// Full-screen zoomable figure. iOS: native pinch via ScrollView zoom. Android/iOS: +/- buttons resize the image
// inside a two-axis scroller (no extra gesture dependencies).
import React, { useState } from "react";
import { Image, Modal, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./ui";
import { FigureImg } from "./FigureImg";
import { bundledImage, isRemoteFigure, type ShownFigure } from "../content/useFigure";

export function FigureViewer({ source, visible, onClose }: { source: ShownFigure; visible: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [zoom, setZoom] = useState(1);
  // resolveAssetSource exists on iOS/Android only; on web the bundled asset already carries its size.
  // A remote figure may come without a size: it is measured when it loads (square until then).
  const bundled = bundledImage(source);
  const resolved: { width?: number; height?: number } | null = isRemoteFigure(source)
    ? source
    : bundled === undefined ? null
    : typeof Image.resolveAssetSource === "function" ? Image.resolveAssetSource(bundled) : typeof bundled === "object" ? (bundled as object) : null;
  const [loadedRatio, setLoadedRatio] = useState(0);
  const ratio = resolved?.width && resolved?.height ? resolved.width / resolved.height : loadedRatio || 1;
  const baseW = Math.min(width, height * ratio);
  const w = baseW * zoom;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.root}>
        <ScrollView
          style={{ flex: 1 }}
          maximumZoomScale={Platform.OS === "ios" ? 4 : 1}
          minimumZoomScale={1}
          contentContainerStyle={{ minWidth: width, minHeight: height * 0.7, alignItems: "center", justifyContent: "center" }}
          horizontal={false}
        >
          <ScrollView horizontal contentContainerStyle={{ minWidth: width, alignItems: "center", justifyContent: "center" }} nestedScrollEnabled>
            <FigureImg fig={source} style={{ width: w, height: w / ratio, backgroundColor: "#fff" }} onRatio={setLoadedRatio} label="Question figure" />
          </ScrollView>
        </ScrollView>
        <View style={styles.bar}>
          <Button title="−" small onPress={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} style={styles.zoomBtn} />
          <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
          <Button title="+" small onPress={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={zoom >= 4} style={styles.zoomBtn} />
          <View style={{ flex: 1 }} />
          <Button title="Close" variant="gold" small onPress={() => { setZoom(1); onClose(); }} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  bar: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10, backgroundColor: "#222" },
  zoomBtn: { width: 56 },
  zoomText: { color: "#fff", fontWeight: "800", width: 56, textAlign: "center" },
});
