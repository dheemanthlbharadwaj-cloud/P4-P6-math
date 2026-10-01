// Renders pre-tokenized math (RichToken[]): text, stacked fractions (with mixed whole part), sup/sub, sqrt, br.
// No WebView / KaTeX. Fullwidth currency "＄" is displayed as "$".
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from "react-native";
import type { RichToken } from "@p6/shared";
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
  return (
    <Text accessibilityLabel={richToPlain(tokens)} style={[{ fontSize: size, color, lineHeight: size * 1.7, fontWeight: bold ? "700" : "400" }, style]}>
      <Inline tokens={tokens} size={size} color={color} bold={bold} />
    </Text>
  );
}

function Inline({ tokens, size, color, bold }: { tokens: RichToken[]; size: number; color: string; bold?: boolean }) {
  return (
    <>
      {tokens.map((t, i) => {
        switch (t.t) {
          case "text":
            return <Text key={i}>{normalizeText(t.v)}</Text>;
          case "br":
            return <Text key={i}>{"\n"}</Text>;
          case "frac": {
            const small = Math.max(12, size * 0.85);
            return (
              <Text key={i}>
                {t.w ? <Text>{normalizeText(t.w)}</Text> : null}
                <View style={styles.frac}>
                  <Text style={[styles.fracPart, { fontSize: small, color, lineHeight: small * 1.25 }]}>
                    <Inline tokens={t.n} size={small} color={color} bold={bold} />
                  </Text>
                  <View style={[styles.fracBar, { backgroundColor: color }]} />
                  <Text style={[styles.fracPart, { fontSize: small, color, lineHeight: small * 1.25 }]}>
                    <Inline tokens={t.d} size={small} color={color} bold={bold} />
                  </Text>
                </View>
              </Text>
            );
          }
          case "sup":
          case "sub": {
            const s = size * 0.65;
            const dy = t.t === "sup" ? -size * 0.4 : size * 0.25;
            return (
              <View key={i} style={{ transform: [{ translateY: dy }] }}>
                <Text style={{ fontSize: s, color, lineHeight: s * 1.3 }}>
                  <Inline tokens={t.v} size={s} color={color} bold={bold} />
                </Text>
              </View>
            );
          }
          case "sqrt":
            return (
              <Text key={i}>
                <Text>{"√"}</Text>
                <View style={{ borderTopWidth: 1.5, borderTopColor: color, paddingHorizontal: 1 }}>
                  <Text style={{ fontSize: size, color, lineHeight: size * 1.3 }}>
                    <Inline tokens={t.v} size={size} color={color} bold={bold} />
                  </Text>
                </View>
              </Text>
            );
        }
      })}
    </>
  );
}

const styles = StyleSheet.create({
  frac: { alignItems: "center", marginHorizontal: 2 },
  fracPart: { textAlign: "center" },
  fracBar: { height: 1.5, alignSelf: "stretch", marginVertical: 1 },
});
