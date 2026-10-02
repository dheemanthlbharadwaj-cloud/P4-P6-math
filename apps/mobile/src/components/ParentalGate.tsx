// Grown-ups-only check, used before deleting the account (subscriptions only show a "tell a grown-up" notice).
import React, { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Body, Button, CenterModal, H2 } from "./ui";
import { colors, fonts, radius } from "../theme/colors";

export function ParentalGate({ visible, onPass, onCancel }: { visible: boolean; onPass: () => void; onCancel: () => void }) {
  const [seed, setSeed] = useState(0);
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);
  const { a, b } = useMemo(() => ({ a: 6 + Math.floor(Math.random() * 6), b: 6 + Math.floor(Math.random() * 6) }), [seed, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (Number(value.trim()) === a * b) {
      setValue(""); setWrong(false); onPass();
    } else {
      setWrong(true); setValue(""); setSeed((s) => s + 1);
    }
  };
  const cancel = () => { setValue(""); setWrong(false); onCancel(); };

  return (
    <CenterModal visible={visible} onClose={cancel}>
      <H2>Grown-ups only</H2>
      <Body style={{ marginVertical: 8 }}>Ask a parent or guardian to solve this to continue.</Body>
      <Text style={{ fontSize: 32, fontFamily: fonts.display, color: colors.ink, textAlign: "center", marginVertical: 8 }}>{a} × {b} = ?</Text>
      <TextInput
        value={value}
        onChangeText={(t) => { setValue(t.replace(/[^0-9]/g, "")); setWrong(false); }}
        keyboardType="number-pad"
        accessibilityLabel="Answer"
        style={{ borderWidth: 3, borderColor: wrong ? colors.bad : colors.border, borderRadius: radius.m, minHeight: 52, fontSize: 24, textAlign: "center", backgroundColor: "#fff" }}
        onSubmitEditing={submit}
      />
      {wrong ? <Text style={{ color: colors.bad, fontWeight: "700", marginTop: 6 }}>Not quite. Try this new one.</Text> : null}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Button title="Cancel" variant="ghost" onPress={cancel} style={{ flex: 1 }} />
        <Button title="Continue" onPress={submit} disabled={!value} style={{ flex: 1 }} />
      </View>
    </CenterModal>
  );
}
