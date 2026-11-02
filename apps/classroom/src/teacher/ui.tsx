// Small desktop-first building blocks for the teacher dashboard, in the app's colours and fonts (theme/colors.ts).
// Buttons, cards and headings come from components/ui.tsx; this adds dense tables, fields, pills, badges and bars.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import { colors, font, fonts, radius, space } from "../theme/colors";
import { Button, Card } from "../components/ui";
import { friendlyError } from "./client";

export const T = { text: 15, small: 13 };

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: space.m, marginBottom: space.l }}>
      <View style={{ flexShrink: 1 }}>
        <Text accessibilityRole="header" style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink }}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: T.text, color: colors.inkSoft, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={{ flexDirection: "row", gap: space.s, alignItems: "center", flexWrap: "wrap" }}>{right}</View> : null}
    </View>
  );
}

export function Panel({ title, right, children, style }: { title?: string; right?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Card style={[{ padding: space.l, borderRadius: radius.m, marginBottom: space.l }, style]}>
      {title || right ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: space.s, marginBottom: space.m }}>
          {title ? <Text style={{ fontSize: font.h2 - 2, fontFamily: fonts.display, color: colors.ink }}>{title}</Text> : <View />}
          {right}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

export function Muted({ children, style }: { children: React.ReactNode; style?: StyleProp<import("react-native").TextStyle> }) {
  return <Text style={[{ fontSize: T.text, color: colors.inkSoft }, style]}>{children}</Text>;
}

export function Notice({ kind = "info", children, onRetry }: { kind?: "info" | "error" | "good"; children: React.ReactNode; onRetry?: () => void }) {
  const bg = kind === "error" ? colors.badBg : kind === "good" ? colors.goodBg : colors.highlight;
  return (
    <View accessibilityRole={kind === "error" ? "alert" : undefined} style={{ flexDirection: "row", alignItems: "center", gap: space.m, backgroundColor: bg, borderRadius: radius.s, borderWidth: 2, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: space.m, marginBottom: space.m }}>
      <Text style={{ flex: 1, fontSize: T.text, color: colors.ink }}>{children}</Text>
      {onRetry ? <Button title="Try again" small variant="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

export function Badge({ text, tone = "plain" }: { text: string; tone?: "plain" | "gold" | "blue" | "pink" | "green" | "grey" }) {
  const bg = { plain: "#fff", gold: colors.gold, blue: colors.friend, pink: "#ffd9e8", green: colors.goodBg, grey: "#eee6e0" }[tone];
  return (
    <View style={{ alignSelf: "flex-start", backgroundColor: bg, borderWidth: 2, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 }}>
      <Text style={{ fontSize: 12, fontFamily: fonts.displayMedium, color: colors.ink }}>{text}</Text>
    </View>
  );
}

/** A compact choice pill (for filters and pickers). */
export function Pill({ label, selected, onPress, disabled }: { label: string; selected?: boolean; onPress?: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [s.pill, selected && { backgroundColor: colors.primary }, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
      <Text style={[s.pillText, selected && { color: "#fff" }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
export function PillRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: 6 }, style]}>{children}</View>;
}

export function Field({ label, hint, style, ...p }: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={[{ marginBottom: space.m }, style as StyleProp<ViewStyle>]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.muted} accessibilityLabel={label} {...p} style={[s.input, p.multiline && { minHeight: 110, textAlignVertical: "top" }]} />
      {hint ? <Text style={{ fontSize: T.small, color: colors.inkSoft, marginTop: 3 }}>{hint}</Text> : null}
    </View>
  );
}

export interface Column { key: string; title: string; flex?: number; width?: number; align?: "left" | "center" | "right" }
export interface RowData { key: string; cells: React.ReactNode[]; onPress?: () => void; expanded?: React.ReactNode; highlight?: boolean; title?: string }

/** A dense table: header row + rows (optionally clickable, optionally expanding under the row). */
export function Table({ columns, rows, empty = "Nothing here yet." }: { columns: Column[]; rows: RowData[]; empty?: string }) {
  const cellStyle = (c: Column): ViewStyle => (c.width ? { width: c.width } : { flex: c.flex ?? 1, minWidth: 0 });
  return (
    <View style={s.table}>
      <View style={[s.tr, s.thead]}>
        {columns.map((c) => (
          <View key={c.key} style={[s.td, cellStyle(c)]}>
            <Text style={[s.th, { textAlign: c.align ?? "left" }]}>{c.title}</Text>
          </View>
        ))}
      </View>
      {rows.length === 0 ? <View style={{ padding: space.l }}><Muted>{empty}</Muted></View> : null}
      {rows.map((r, ri) => (
        <View key={r.key}>
          <RowShell row={r} stripe={ri % 2 === 1}>
            {r.cells.map((cell, ci) => (
              <View key={ci} style={[s.td, cellStyle(columns[ci])]}>
                {typeof cell === "string" || typeof cell === "number"
                  ? <Text style={{ fontSize: T.text, color: colors.ink, textAlign: columns[ci].align ?? "left" }}>{cell}</Text>
                  : cell}
              </View>
            ))}
          </RowShell>
          {r.expanded ? <View style={s.expanded}>{r.expanded}</View> : null}
        </View>
      ))}
    </View>
  );
}

/** A table row: pressable (hover highlight) only when it has an action, else a plain row (so inputs inside stay enabled). */
function RowShell({ row, stripe, children }: { row: RowData; stripe: boolean; children: React.ReactNode }) {
  const base: ViewStyle[] = [s.tr, stripe ? { backgroundColor: "#fffbf3" } : {}, row.highlight ? { backgroundColor: colors.highlight } : {}];
  if (!row.onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={row.onPress} accessibilityRole="button" {...(row.title ? ({ title: row.title } as object) : {})}
      style={(st) => [...base, (st as { hovered?: boolean }).hovered ? { backgroundColor: colors.friend } : {}]}>
      {children}
    </Pressable>
  );
}

/** Horizontal bar: label · bar with fill · value. */
export function Bar({ label, value, right, color = colors.good, sub, labelWidth = 190 }: { label: string; value: number; right?: string; color?: string; sub?: string; labelWidth?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, marginBottom: 7 }} accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}>
      <View style={{ width: labelWidth }}>
        <Text style={{ fontSize: T.text, color: colors.ink }} numberOfLines={1}>{label}</Text>
        {sub ? <Text style={{ fontSize: 12, color: colors.inkSoft }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <View style={s.barTrack}>
        <View style={{ width: `${v * 100}%`, height: "100%", backgroundColor: color }} />
      </View>
      <Text style={{ width: 118, fontSize: T.small, color: colors.inkSoft, textAlign: "right" }}>{right ?? `${Math.round(v * 100)}%`}</Text>
    </View>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <View style={{ padding: space.xl, alignItems: "center", gap: 8 }}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Muted>{label}</Muted> : null}
    </View>
  );
}

/** Loads something on mount / when `deps` change. `data` keeps the last result while reloading. */
export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList): { data: T | undefined; error: string | null; loading: boolean; reload: () => void; set: (v: T) => void } {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  const seq = useRef(0);
  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    fn().then(
      (d) => { if (mine === seq.current) { setData(d); setError(null); setLoading(false); } },
      (e) => { if (mine === seq.current) { setError(friendlyError(e)); setLoading(false); } },
    );
    return () => { seq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { data, error, loading, reload, set: setData };
}

/** Run an action with busy/error state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(friendlyError(e)); return undefined; } finally { setBusy(false); }
  }, []);
  return { busy, error, run, clear: () => setError(null) };
}

/** Two-step delete: first press arms it ("Sure?"), second confirms. */
export function ConfirmButton({ title, confirmTitle = "Sure? Delete", onConfirm, disabled }: { title: string; confirmTitle?: string; onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return <Button title={armed ? confirmTitle : title} small variant={armed ? "bad" : "ghost"} disabled={disabled} onPress={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))} />;
}

const s = StyleSheet.create({
  pill: { minHeight: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: "center", backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border },
  pillText: { fontSize: T.small + 1, fontFamily: fonts.displayMedium, color: colors.ink },
  label: { fontSize: T.small, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4 },
  input: { minHeight: 44, borderWidth: 2, borderColor: colors.border, borderRadius: radius.s, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, backgroundColor: "#fff", color: colors.ink },
  table: { borderWidth: 2, borderColor: colors.border, borderRadius: radius.s, overflow: "hidden", backgroundColor: "#fff" },
  tr: { flexDirection: "row", alignItems: "center", minHeight: 44, borderTopWidth: 1, borderTopColor: "#eadfd3" },
  thead: { backgroundColor: colors.highlight, borderTopWidth: 0, minHeight: 38 },
  th: { fontSize: T.small, fontFamily: fonts.displayMedium, color: colors.inkSoft },
  td: { paddingHorizontal: 10, paddingVertical: 6, justifyContent: "center" },
  expanded: { paddingHorizontal: space.l, paddingVertical: space.m, backgroundColor: "#fffdf8", borderTopWidth: 1, borderTopColor: "#eadfd3" },
  barTrack: { flex: 1, height: 16, borderRadius: 8, backgroundColor: "#f1e6dc", borderWidth: 2, borderColor: colors.border, overflow: "hidden" },
});
