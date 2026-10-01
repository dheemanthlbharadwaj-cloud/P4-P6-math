// Full-screen zoomable figure. iOS: native pinch via ScrollView zoom. Android/iOS: +/- buttons resize the image
// inside a two-axis scroller (no extra gesture dependencies).
import React, { useState } from "react";
import { Image, Modal, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "./ui";

export function FigureViewer({ source, visible, onClose }: { source: number; visible: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [zoom, setZoom] = useState(1);
  const resolved = Image.resolveAssetSource(source);
  const ratio = resolved ? resolved.width / resolved.height : 1;
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
            <Image source={source} style={{ width: w, height: w / ratio, backgroundColor: "#fff" }} resizeMode="contain" accessibilityLabel="Question figure" />
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
