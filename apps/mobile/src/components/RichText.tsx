// Renders pre-tokenized math (RichToken[]): text, stacked fractions (with mixed whole part), sup/sub, sqrt, br.
// Layout: when a line holds anything stacked (fraction, sup/sub, sqrt) it is a centred flex row of inline groups so signs and whole numbers sit
// on the fraction bar (the maths axis); text runs are split into word chunks so long lines still wrap. No View inside Text. No WebView / KaTeX. Fullwidth currency "＄" is displayed as "$".
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import type { RichToken } from "@p6/shared";
import { chunkText, needsRowLayout, splitLines } from "../logic/richLayout";
import { colors } from "../theme/colors";

export const normalizeText = (s: string) => s.replace(/＄/g, "$");

/** Plain-text rendering (accessibility labels, debugging). */
export function richToPlain(tokens: RichToken[]): string {
  return tokens
    .map((t) => {
      switch (t.t) {
        case "text": return normalizeText(t.v);
        case "frac": return `${t.w ? t.w + " " : ""}${richToPlain(t.n)}/${richToPlain(t.d)}`;
        case "sup": return `^${richToPlain(t.v)}`;
        case "sub": return `_${richToPlain(t.v)}`;
        case "sqrt": return `√(${richToPlain(t.v)})`;
        case "br": return "\n";
      }
    })
    .join("");
}

interface Props {
  tokens: RichToken[];
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  bold?: boolean;
}

export function RichText({ tokens, size = 18, color = colors.ink, style, bold }: Props) {
  const label = richToPlain(tokens);
  const weight = bold ? "700" : "400";
  if (!needsRowLayout(tokens)) {
    return (
      <Text accessibilityLabel={label} style={[{ fontSize: size, color, lineHeight: size * 1.7, fontWeight: weight }, style]}>
        {tokens.map((t, i) => (t.t === "text" ? normalizeText(t.v) : t.t === "br" ? "\n" : ""))}
      </Text>
    );
  }
  return (
    <View accessible accessibilityLabel={label} style={{ alignSelf: "stretch" }}>
      {splitLines(tokens).map((line, li) => (
        <Row key={li} tokens={line} size={size} color={color} bold={bold} weight={weight} wrap style={style} />
      ))}
    </View>
  );
}

interface RowProps { tokens: RichToken[]; size: number; color: string; bold?: boolean; weight: "700" | "400"; wrap?: boolean; style?: StyleProp<TextStyle> }

/** One line: groups side by side, vertically centred (fraction bars line up with signs and whole numbers). */
function Row({ tokens, size, color, bold, weight, wrap, style }: RowProps) {
  const textStyle = [{ fontSize: size, color, lineHeight: size * 1.6, fontWeight: weight }, style];
  return (
    <View style={{ flexDirection: "row", flexWrap: wrap ? "wrap" : "nowrap", alignItems: "center", minHeight: wrap ? size * 1.6 : undefined }}>
      {tokens.map((t, i) => {
        switch (t.t) {
          case "text":
            return (wrap ? chunkText(normalizeText(t.v)) : [normalizeText(t.v)]).map((c, j) => (
              <Text key={`${i}.${j}`} style={textStyle} numberOfLines={wrap ? undefined : 1}>{c}</Text>
            ));
          case "br":
            return null;
          case "frac": {
            const small = Math.max(12, size * 0.85);
            return (
              <View key={i} style={styles.mixed}>
                {t.w ? <Text style={textStyle}>{normalizeText(t.w)}</Text> : null}
                <View style={styles.frac}>
                  <Row tokens={t.n} size={small} color={color} bold={bold} weight={weight} style={[styles.fracPart, { lineHeight: small * 1.15 }]} />
                  <View style={[styles.fracBar, { backgroundColor: color }]} />
                  <Row tokens={t.d} size={small} color={color} bold={bold} weight={weight} style={[styles.fracPart, { lineHeight: small * 1.15 }]} />
                </View>
              </View>
            );
          }
          case "sup":
          case "sub": {
            const s = size * 0.65;
            const dy = t.t === "sup" ? -size * 0.35 : size * 0.3;
            return (
              <View key={i} style={{ transform: [{ translateY: dy }] }}>
                <Row tokens={t.v} size={s} color={color} bold={bold} weight={weight} />
              </View>
            );
          }
          case "sqrt":
            return (
              <View key={i} style={styles.mixed}>
                <Text style={textStyle}>{"√"}</Text>
                <View style={{ borderTopWidth: 1.5, borderTopColor: color, paddingHorizontal: 1 }}>
                  <Row tokens={t.v} size={size} color={color} bold={bold} weight={weight} />
                </View>
              </View>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  mixed: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  frac: { alignItems: "center", marginHorizontal: 2, flexShrink: 0 },
  fracPart: { textAlign: "center" },
  fracBar: { height: 1.5, alignSelf: "stretch", marginVertical: 1 },
});
