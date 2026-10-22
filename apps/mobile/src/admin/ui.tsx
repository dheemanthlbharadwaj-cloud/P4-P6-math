// Admin-only building blocks. Everything else (Panel, Table, Field, Pill, Badge, Notice, ConfirmButton, ...) is reused
// from the teacher dashboard so the two look the same.
import React, { useEffect, useState } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Button } from "../components/ui";
import { colors, fonts, radius, space } from "../theme/colors";
import { Field, Muted } from "../teacher/ui";
import { matchesClassName } from "./helpers";

export { Badge, ConfirmButton, Field, Muted, Notice, PageHeader, Panel, Pill, PillRow, Table, useAction } from "../teacher/ui";

export interface Option { value: string; label: string }

/** A drop-down (a native <select>; the dashboard is web only). */
export function Select({ label, value, onChange, options, disabled, style }: { label?: string; value: string; onChange: (v: string) => void; options: Option[]; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      {label ? <Text style={{ fontSize: 13, fontFamily: fonts.displayMedium, color: colors.inkSoft, marginBottom: 4 }}>{label}</Text> : null}
      {React.createElement(
        "select",
        {
          value, disabled, "aria-label": label,
          onChange: (e: { target: { value: string } }) => onChange(e.target.value),
          style: { minHeight: 44, border: `2px solid ${colors.border}`, borderRadius: radius.s, padding: "8px 12px", fontSize: 16, background: "#fff", color: colors.ink, fontFamily: "inherit", maxWidth: "100%" },
        },
        options.map((o) => React.createElement("option", { key: o.value, value: o.value }, o.label)),
      )}
    </View>
  );
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/**
 * A password shown ONCE. The parent owns it only while the box is open: `onClose` must drop it. It is never logged or
 * stored anywhere else.
 */
export function SecretBox({ title, password, onClose }: { title: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  useEffect(() => { if (copied) { const t = setTimeout(() => setCopied(null), 2500); return () => clearTimeout(t); } }, [copied]);
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: colors.highlight, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, padding: space.l, marginBottom: space.l }}>
      <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink, marginBottom: space.s }}>{title}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, flexWrap: "wrap", marginBottom: space.s }}>
        <View style={{ backgroundColor: "#fff", borderWidth: 2, borderColor: colors.border, borderRadius: radius.s, paddingVertical: 10, paddingHorizontal: 14 }}>
          <Text selectable testID="shown-once-password" style={{ fontSize: 22, letterSpacing: 1.5, color: colors.ink, fontFamily: "monospace" }}>{password}</Text>
        </View>
        <Button title={copied ? "Copied" : "Copy"} small variant="good" onPress={() => { void copyText(password).then((ok) => setCopied(ok)); }} />
        <Button title="Close" small variant="ghost" onPress={onClose} />
      </View>
      {copied === false ? <Text style={{ fontSize: 13, color: colors.bad, marginBottom: 4 }}>Couldn't copy. Select the password and copy it by hand.</Text> : null}
      <Muted>Give this to the teacher privately. It won't be shown again.</Muted>
    </View>
  );
}

/** Delete only after the class name has been typed. */
export function TypeToConfirm({ name, onConfirm, disabled, label = "Delete class" }: { name: string; onConfirm: () => void; disabled?: boolean; label?: string }) {
  const [typed, setTyped] = useState("");
  useEffect(() => setTyped(""), [name]);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.m, flexWrap: "wrap" }}>
      <Field label={`Type "${name}" to delete it`} value={typed} onChangeText={setTyped} autoCapitalize="none" autoCorrect={false} style={{ width: 300, marginBottom: 0 }} />
      <Button title={label} variant="bad" small disabled={disabled || !matchesClassName(typed, name)} onPress={onConfirm} />
    </View>
  );
}
