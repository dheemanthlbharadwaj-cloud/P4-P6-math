import React from "react";
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, fonts, MIN_TOUCH, radius, space } from "../theme/colors";

type Variant = "primary" | "good" | "bad" | "ghost" | "gold";
const bg: Record<Variant, string> = { primary: colors.primary, good: colors.good, bad: colors.bad, ghost: colors.card, gold: colors.accent };
// Darker lip under each candy button (its "depth").
const lip: Record<Variant, string> = { primary: "#1f2f8a", good: "#16645b", bad: "#9b1b26", ghost: colors.border, gold: "#b07a00" };

export function Button({
  title, onPress, variant = "primary", disabled, small, style, textStyle, testID,
}: {
  title: string; onPress?: () => void; variant?: Variant; disabled?: boolean; small?: boolean;
  style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>; testID?: string;
}) {
  const dark = variant === "ghost" || variant === "gold";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn, small && styles.btnSmall, { backgroundColor: bg[variant], borderBottomColor: lip[variant] },
        disabled && { opacity: 0.45 }, pressed && { transform: [{ translateY: 3 }], borderBottomWidth: 3 }, style,
      ]}
    >
      {variant !== "ghost" ? <View pointerEvents="none" style={styles.gloss} /> : null}
      <Text style={[styles.btnText, dark && { color: colors.ink }, !dark && styles.btnTextShadow, small && { fontSize: font.small + 1 }, textStyle]}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Screen({ children, style, edges = ["top"] }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; edges?: ("top" | "bottom" | "left" | "right")[] }) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: colors.bg }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function H1({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontSize: font.h1 + 2, fontFamily: fonts.display, color: colors.ink }, style]}>{children}</Text>;
}
export function H2({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontSize: font.h2, fontFamily: fonts.display, color: colors.ink }, style]}>{children}</Text>;
}
export function Body({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontSize: font.body, color: colors.ink, lineHeight: 24 }, style]}>{children}</Text>;
}

export function ProgressBar({ value, style }: { value: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.track, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, selected && { backgroundColor: colors.primary }]}
    >
      <Text style={[styles.chipText, selected && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

export function Sheet({ visible, onClose, children, dismissable = true }: { visible: boolean; onClose?: () => void; children: React.ReactNode; dismissable?: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismissable ? onClose : undefined} statusBarTranslucent>
      <View style={styles.scrim}>
        <Pressable style={{ flex: 1 }} onPress={dismissable ? onClose : undefined} accessibilityLabel="Close" />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function CenterModal({ visible, onClose, children }: { visible: boolean; onClose?: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.scrim, { justifyContent: "center", padding: space.l }]}>
        <View style={styles.dialog}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: MIN_TOUCH, paddingHorizontal: space.l, paddingVertical: space.m, borderRadius: radius.m, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: colors.border, borderBottomWidth: 6,
  },
  btnSmall: { minHeight: 44, paddingVertical: space.s, paddingHorizontal: space.m },
  btnText: { color: "#fff", fontSize: font.body + 1, fontFamily: fonts.display, textAlign: "center", letterSpacing: 0.3 },
  btnTextShadow: { textShadowColor: "rgba(0,0,0,0.28)", textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  gloss: { position: "absolute", top: 3, left: 8, right: 8, height: "42%", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.24)" },
  card: { backgroundColor: colors.card, borderRadius: radius.l, padding: space.l, borderWidth: 3, borderColor: colors.border },
  track: { height: 18, borderRadius: 9, backgroundColor: "#e3e6f0", borderWidth: 2, borderColor: colors.border, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: "#3ccf6e" },
  chip: { minHeight: 44, paddingHorizontal: space.l, borderRadius: 22, justifyContent: "center", backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, marginRight: space.s, marginBottom: space.s },
  chipText: { fontSize: font.small + 1, fontFamily: fonts.displayMedium, color: colors.ink },
  scrim: { flex: 1, backgroundColor: "rgba(20,20,40,0.55)" },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: space.l, borderWidth: 3, borderColor: colors.border, maxHeight: "85%" },
  dialog: { backgroundColor: colors.bg, borderRadius: radius.l, padding: space.l, borderWidth: 3, borderColor: colors.border, maxHeight: "90%", width: "100%", maxWidth: 520, alignSelf: "center" },
});
