// Pop-up calculator for questions where a calculator is allowed (Paper 2). Slides up from the bottom; close with the
// ✕ button, the backdrop or the device back button. Arithmetic is the safe evaluator in logic/calculator (no eval).
import React, { useEffect, useRef, useState } from "react";
import { Animated, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { evaluate, formatResult } from "../logic/calculator";
import { uiAssets } from "../theme/assets";
import { catPoses } from "../theme/cats";
import { colors, fonts } from "../theme/colors";

type Kind = "num" | "op" | "eq" | "clear" | "fn";
const KEYS: { k: string; kind: Kind; label?: string }[][] = [
  [{ k: "C", kind: "clear" }, { k: "(", kind: "fn" }, { k: ")", kind: "fn" }, { k: "÷", kind: "op" }],
  [{ k: "7", kind: "num" }, { k: "8", kind: "num" }, { k: "9", kind: "num" }, { k: "×", kind: "op" }],
  [{ k: "4", kind: "num" }, { k: "5", kind: "num" }, { k: "6", kind: "num" }, { k: "−", kind: "op" }],
  [{ k: "1", kind: "num" }, { k: "2", kind: "num" }, { k: "3", kind: "num" }, { k: "+", kind: "op" }],
  [{ k: "0", kind: "num" }, { k: ".", kind: "num" }, { k: "⌫", kind: "fn", label: "Delete" }, { k: "=", kind: "eq", label: "Equals" }],
];

const KEY_COLORS: Record<Kind, { face: string; edge: string; text: string }> = {
  num: { face: "#ffffff", edge: "#c9cde0", text: colors.ink },
  op: { face: "#ffc94d", edge: "#e09b00", text: colors.ink },
  eq: { face: "#3ccf91", edge: "#1f9466", text: "#ffffff" },
  clear: { face: "#ff8a80", edge: "#d6544a", text: "#ffffff" },
  fn: { face: "#cfe3ff", edge: "#8fb2e6", text: colors.ink },
};

export function CalculatorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (result == null) return;
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [result, pop]);

  const press = (k: string) => {
    if (k === "C") { setExpr(""); setResult(null); return; }
    if (k === "⌫") { setExpr((e) => e.slice(0, -1)); setResult(null); return; }
    if (k === "=") {
      const v = evaluate(expr);
      setResult(v == null ? "Oops!" : formatResult(v));
      return;
    }
    // Keep going from the last answer when an operator comes next.
    if (result && result !== "Oops!" && /[+−×÷]/.test(k)) { setExpr(result + k); setResult(null); return; }
    setExpr((e) => (result ? k : e + k));
    setResult(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close calculator" />
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal>
        <Image source={catPoses.cute} style={styles.peekCat} resizeMode="contain" accessibilityIgnoresInvertColors />
        <View style={styles.header}>
          <Image source={uiAssets.icons.calculator} style={{ width: 34, height: 34 }} />
          <Text style={styles.title}>Calculator</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close calculator" hitSlop={10}
            style={({ pressed }) => [styles.closeBtn, pressed && { transform: [{ scale: 0.92 }] }]}>
            <Text style={styles.closeX}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.screen} accessibilityLiveRegion="polite">
          <Text style={styles.expr} numberOfLines={1} adjustsFontSizeToFit>{expr || "0"}</Text>
          <Animated.Text style={[styles.result, result === "Oops!" && { color: "#ff8a80" }, { transform: [{ scale: pop }] }]} numberOfLines={1} adjustsFontSizeToFit>
            {result != null ? `= ${result}` : " "}
          </Animated.Text>
        </View>

        <View style={{ gap: 10 }}>
          {KEYS.map((row, i) => (
            <View key={i} style={styles.row}>
              {row.map(({ k, kind, label }) => {
                const c = KEY_COLORS[kind];
                return (
                  <Pressable key={k} onPress={() => press(k)} accessibilityRole="button" accessibilityLabel={label ?? k}
                    style={({ pressed }) => [styles.key, { backgroundColor: c.face, borderBottomColor: c.edge }, pressed && styles.keyDown]}>
                    <Text style={[styles.keyText, { color: c.text }]}>{k}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,22,40,0.45)" },
  sheet: {
    backgroundColor: "#5b6ef5", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 3, borderBottomWidth: 0,
    borderColor: colors.border, paddingHorizontal: 16, paddingTop: 14,
  },
  peekCat: { position: "absolute", top: -58, right: 26, width: 78, height: 72 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  title: { flex: 1, fontSize: 22, fontFamily: fonts.display, color: "#ffffff", letterSpacing: 0.3 },
  closeBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: "#ffffff", borderWidth: 3, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  closeX: { fontSize: 20, fontFamily: fonts.display, color: colors.ink },
  screen: {
    backgroundColor: "#203040", borderRadius: 18, borderWidth: 3, borderColor: colors.border, paddingVertical: 10,
    paddingHorizontal: 14, marginBottom: 14, minHeight: 92, justifyContent: "flex-end",
  },
  expr: { fontSize: 22, color: "#9fe8c4", textAlign: "right", fontVariant: ["tabular-nums"] },
  result: { fontSize: 38, fontFamily: fonts.display, color: "#c8ffe0", textAlign: "right", fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", gap: 10 },
  key: {
    flex: 1, minHeight: 58, borderRadius: 16, borderWidth: 3, borderBottomWidth: 7, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  keyDown: { borderBottomWidth: 3, transform: [{ translateY: 4 }] },
  keyText: { fontSize: 26, fontFamily: fonts.display },
});
