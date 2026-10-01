import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { evaluate, formatResult } from "../logic/calculator";
import { CenterModal } from "./ui";
import { colors, radius } from "../theme/colors";

const ROWS: string[][] = [
  ["C", "(", ")", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "−"],
  ["1", "2", "3", "+"],
  ["0", ".", "⌫", "="],
];

export function CalculatorModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const press = (k: string) => {
    if (k === "C") { setExpr(""); setResult(null); return; }
    if (k === "⌫") { setExpr((e) => e.slice(0, -1)); setResult(null); return; }
    if (k === "=") {
      const v = evaluate(expr);
      setResult(v == null ? "Error" : formatResult(v));
      return;
    }
    // continue from a result when an operator is pressed
    if (result && result !== "Error" && /[+−×÷]/.test(k)) { setExpr(result + k); setResult(null); return; }
    setExpr((e) => (result ? k : e + k));
    setResult(null);
  };

  return (
    <CenterModal visible={visible} onClose={onClose}>
      <View style={styles.display} accessibilityLiveRegion="polite">
        <Text style={styles.expr} numberOfLines={1} adjustsFontSizeToFit>{expr || " "}</Text>
        <Text style={styles.result} numberOfLines={1} adjustsFontSizeToFit>{result ?? " "}</Text>
      </View>
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((k) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={k} onPress={() => press(k)} style={[styles.key, /[÷×−+=]/.test(k) && styles.op, k === "C" && styles.clear]}>
              <Text style={[styles.keyText, /[÷×−+=]/.test(k) && { color: "#fff" }]}>{k}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Pressable onPress={onClose} accessibilityRole="button" style={styles.close}>
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </CenterModal>
  );
}

const styles = StyleSheet.create({
  display: { backgroundColor: "#dff6e5", borderRadius: radius.m, borderWidth: 3, borderColor: colors.border, padding: 12, marginBottom: 10, minHeight: 84 },
  expr: { fontSize: 22, color: colors.inkSoft, textAlign: "right" },
  result: { fontSize: 34, fontWeight: "900", color: colors.ink, textAlign: "right" },
  row: { flexDirection: "row", marginBottom: 8, gap: 8 },
  key: { flex: 1, minHeight: 56, borderRadius: radius.m, backgroundColor: colors.card, borderWidth: 3, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  op: { backgroundColor: colors.primary },
  clear: { backgroundColor: colors.badBg },
  keyText: { fontSize: 24, fontWeight: "900", color: colors.ink },
  close: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 4 },
  closeText: { fontSize: 17, fontWeight: "800", color: colors.primaryDark },
});
