// School drop-down: tap to open a searchable list of every Singapore primary school.
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { PRIMARY_SCHOOLS } from "../data/schools";
import { Sheet } from "./ui";
import { colors, fonts, radius } from "../theme/colors";

export function SchoolPicker({ value, onChange }: { value: string; onChange: (school: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return PRIMARY_SCHOOLS.filter((s) => words.every((w) => s.toLowerCase().includes(w)));
  }, [q]);
  return (
    <>
      <Pressable onPress={() => { setQ(""); setOpen(true); }} accessibilityRole="button" accessibilityLabel={value ? `School: ${value}. Tap to change` : "Choose your school"}
        style={{ minHeight: 56, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 18, color: value ? colors.ink : colors.muted }} numberOfLines={2}>{value || "Choose your school"}</Text>
        <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.inkSoft }}>▾</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink, marginBottom: 10 }}>Choose your school</Text>
        <TextInput value={q} onChangeText={setQ} placeholder="Type to search…" placeholderTextColor={colors.muted} autoFocus accessibilityLabel="Search schools"
          style={{ minHeight: 50, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 12, fontSize: 17, backgroundColor: "#fff", color: colors.ink, marginBottom: 8 }} />
        <FlatList
          data={list}
          keyExtractor={(s) => s}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 420 }}
          ListEmptyComponent={<Text style={{ color: colors.inkSoft, padding: 12 }}>No school matches “{q}”.</Text>}
          renderItem={({ item }) => {
            const on = item === value;
            return (
              <Pressable onPress={() => { onChange(item); setOpen(false); }} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={({ pressed }) => ({ minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10, backgroundColor: on ? colors.highlight : pressed ? "#eef9fc" : "transparent" })}>
                <Text style={{ fontSize: 16, color: colors.ink, fontWeight: on ? "800" : "500" }}>{item}</Text>
              </Pressable>
            );
          }}
        />
      </Sheet>
    </>
  );
}
