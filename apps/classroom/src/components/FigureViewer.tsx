// Full-screen picture with zoom (− / + / Close), for question figures.
import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Button } from "./ui";
import { FigureImg } from "./FigureImg";
import type { ShownFigure } from "../content/useFigure";

export function FigureViewer({ source, visible, onClose }: { source: ShownFigure; visible: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [zoom, setZoom] = useState(1);
  const [loadedRatio, setLoadedRatio] = useState(0);
  const img = source.img;
  const ratio = img?.width && img.height ? img.width / img.height : loadedRatio || 1;
  const baseW = Math.min(width, (height - 80) * ratio);
  const w = baseW * zoom;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={false}>
      <View style={styles.root}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ minWidth: width, minHeight: height - 80, alignItems: "center", justifyContent: "center" }}>
          <ScrollView horizontal contentContainerStyle={{ minWidth: width, alignItems: "center", justifyContent: "center" }}>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  bar: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10, backgroundColor: "#222" },
  zoomBtn: { width: 56 },
  zoomText: { color: "#fff", fontWeight: "800", width: 56, textAlign: "center" },
});
