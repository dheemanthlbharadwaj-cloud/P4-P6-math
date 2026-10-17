// Pop-up calculator for questions where a calculator is allowed (Paper 2). Slides up from the bottom; close with the
// ✕ button, the backdrop or the device back button. Arithmetic is the safe evaluator in logic/calculator (no eval).
import React, { useEffect, useRef, useState } from "react";
import { Animated, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
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

const KEY_COLORS: Record<Kind, { face: string; text: string }> = {
  num: { face: "#ffffff", text: colors.ink },
  op: { face: "#ffc94d", text: colors.ink },
  eq: { face: "#3ccf91", text: "#ffffff" },
  clear: { face: "#ff8a80", text: "#ffffff" },
  fn: { face: "#c6ecf5", text: colors.ink },
};

function useCalc() {
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
  return { expr, result, pop, press };
}

type Calc = ReturnType<typeof useCalc>;

const TIGHT_PANEL_HEIGHT = 420;

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close calculator" hitSlop={10}
      style={({ pressed }) => [styles.closeBtn, { alignSelf: "flex-end" }, pressed && { transform: [{ scale: 0.92 }] }]}>
      <Text style={styles.closeX}>✕</Text>
    </Pressable>
  );
}

function Header({ onClose, compact }: { onClose: () => void; compact?: boolean }) {
  return (
    <View style={[styles.header, compact && { marginBottom: 8 }]}>
      <Image source={uiAssets.icons.calculator} style={{ width: 34, height: 34 }} />
      <Text style={styles.title}>Calculator</Text>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close calculator" hitSlop={10}
        style={({ pressed }) => [styles.closeBtn, pressed && { transform: [{ scale: 0.92 }] }]}>
        <Text style={styles.closeX}>✕</Text>
      </Pressable>
    </View>
  );
}

function Screen({ c, compact }: { c: Calc; compact?: boolean }) {
  return (
    <View style={[styles.screen, compact && { minHeight: 76, marginBottom: 10, paddingVertical: 6 }]} accessibilityLiveRegion="polite">
      <Text style={styles.expr} numberOfLines={1} adjustsFontSizeToFit>{c.expr || "0"}</Text>
      <Animated.Text style={[styles.result, c.result === "Oops!" && { color: "#ff8a80" }, { transform: [{ scale: c.pop }] }]} numberOfLines={1} adjustsFontSizeToFit>
        {c.result != null ? `= ${c.result}` : " "}
      </Animated.Text>
    </View>
  );
}

function Keys({ c, fill, tight }: { c: Calc; fill?: boolean; tight?: boolean }) {
  const gap = tight ? 5 : 10;
  return (
    <View style={[{ gap }, fill && { flex: 1 }]}>
      {KEYS.map((row, i) => (
        <View key={i} style={[styles.row, { gap }, fill && { flex: 1 }]}>
          {row.map(({ k, kind, label }) => {
            const col = KEY_COLORS[kind];
            return (
              <Pressable key={k} onPress={() => c.press(k)} accessibilityRole="button" accessibilityLabel={label ?? k}
                style={({ pressed }) => [styles.key, fill && { minHeight: 40 }, tight && styles.keyTight, { backgroundColor: col.face }, pressed && (tight ? styles.keyDownTight : styles.keyDown)]}>
                <Text style={[styles.keyText, tight && { fontSize: 18 }, { color: col.text }]}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Portrait / phone: bottom sheet over everything (today's behaviour). */
export function CalculatorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const c = useCalc();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close calculator" />
      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]} accessibilityViewIsModal>
        <Image source={catPoses.cute} style={styles.peekCat} resizeMode="contain" accessibilityIgnoresInvertColors />
        <Header onClose={onClose} />
        <Screen c={c} />
        <Keys c={c} />
      </View>
    </Modal>
  );
}

/** Landscape: fills its (positioned) parent, which is the working-space pane, so the question stays visible.
 *  The parent keeps the scratchpad mounted underneath; the entry stays in memory while closed. */
export function CalculatorPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useCalc();
  // Short panes (landscape phones, ~200–400 px tall): screen + close on the left, keypad on the right, so every key fits.
  const [height, setHeight] = useState(0);
  const tight = height > 0 && height < TIGHT_PANEL_HEIGHT;
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, onClose]);
  if (!visible) return null;
  return (
    <View style={[styles.panel, tight && { padding: 8 }]} accessibilityViewIsModal onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {tight ? (
        <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 2, gap: 8 }}>
            <CloseButton onClose={onClose} />
            <View style={{ flex: 1, justifyContent: "flex-end" }}><Screen c={c} compact /></View>
          </View>
          <View style={{ flex: 3 }}><Keys c={c} fill tight /></View>
        </View>
      ) : (
        <>
          <Header onClose={onClose} compact />
          <Screen c={c} compact />
          <Keys c={c} fill />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#12aecf", borderRadius: 24, borderWidth: 3,
    borderColor: colors.border, padding: 12, zIndex: 5,
  },
  backdrop: { flex: 1, backgroundColor: "rgba(20,22,40,0.45)" },
  sheet: {
    backgroundColor: "#12aecf", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 3, borderBottomWidth: 0,
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
  keyTight: { minHeight: 0, borderRadius: 12, borderBottomWidth: 4 },
  keyDownTight: { borderBottomWidth: 3, transform: [{ translateY: 1 }] },
  keyText: { fontSize: 26, fontFamily: fonts.display },
});
