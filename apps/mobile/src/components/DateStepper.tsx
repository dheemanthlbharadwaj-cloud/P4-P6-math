import React from "react";
import { Text, TextInput, View } from "react-native";
import { Button } from "./ui";
import { colors, radius } from "../theme/colors";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const isValidIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());

/** ISO date text input with quick adjust buttons (avoids a native date-picker dependency). */
export function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const shift = (days: number) => {
    const d = new Date(`${isValidIso(value) ? value : iso(new Date())}T00:00:00`);
    d.setDate(d.getDate() + days);
    onChange(iso(d));
  };
  return (
    <View>
      <TextInput
        value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" placeholderTextColor={colors.muted} keyboardType="numbers-and-punctuation" accessibilityLabel="Date, year-month-day" maxLength={10}
        style={{ minHeight: 56, borderWidth: 3, borderColor: isValidIso(value) ? colors.border : colors.bad, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 22, backgroundColor: "#fff", textAlign: "center", color: colors.ink }}
      />
      {!isValidIso(value) ? <Text style={{ color: colors.bad, marginTop: 4, fontWeight: "700" }}>Use the format YYYY-MM-DD</Text> : null}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
        <Button title="-7d" small variant="ghost" style={{ flex: 1 }} onPress={() => shift(-7)} />
        <Button title="-1d" small variant="ghost" style={{ flex: 1 }} onPress={() => shift(-1)} />
        <Button title="+1d" small variant="ghost" style={{ flex: 1 }} onPress={() => shift(1)} />
        <Button title="+7d" small variant="ghost" style={{ flex: 1 }} onPress={() => shift(7)} />
      </View>
    </View>
  );
}
