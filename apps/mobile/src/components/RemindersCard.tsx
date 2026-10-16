// Profile tab "Reminders" card (phone apps only): practice reminder + time, "hearts are full" notice.
import React, { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, Switch, Text, View } from "react-native";
import { Body, Card, H2 } from "./ui";
import { formatSlot, FIRST_SLOT, LAST_SLOT, stepSlot } from "../logic/notifications";
import { useNotifications } from "../store/notifications";
import { getPermission, requestPermission, type PermState } from "../services/notifications";
import { colors, fonts, radius } from "../theme/colors";

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48 }}>
      <Text style={{ flex: 1, fontFamily: fonts.display, fontSize: 17, color: colors.ink }}>{label}</Text>
      <Switch
        value={value} onValueChange={onChange} accessibilityLabel={label}
        trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff"
      />
    </View>
  );
}

function StepButton({ label, onPress, disabled, a11y }: { label: string; onPress: () => void; disabled: boolean; a11y: string }) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y}
      style={({ pressed }) => ({
        width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.m, borderWidth: 3,
        borderColor: colors.border, backgroundColor: pressed ? colors.highlight : "#fff", opacity: disabled ? 0.4 : 1,
      })}
    >
      <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink, lineHeight: 32 }}>{label}</Text>
    </Pressable>
  );
}

export function RemindersCard() {
  const { practiceEnabled, practiceMinutes, heartsFullEnabled, set } = useNotifications();
  const [perm, setPerm] = useState<PermState>("undetermined");

  const refresh = useCallback(() => { void getPermission().then(setPerm); }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") refresh(); }); // back from the phone's Settings
    return () => sub.remove();
  }, [refresh]);

  // The system question is asked only when the kid turns a reminder on.
  const turn = (patch: { practiceEnabled: boolean } | { heartsFullEnabled: boolean }, on: boolean) => {
    set(patch);
    if (on) void requestPermission().then(setPerm);
  };

  return (
    <Card>
      <H2>Reminders</H2>
      <View style={{ marginTop: 6 }}>
        <Row label="Practice reminder" value={practiceEnabled} onChange={(v) => turn({ practiceEnabled: v }, v)} />
        {practiceEnabled ? (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 8 }}>
            <StepButton label="−" a11y="Earlier" disabled={practiceMinutes <= FIRST_SLOT} onPress={() => set({ practiceMinutes: stepSlot(practiceMinutes, -1) })} />
            <View style={{ minWidth: 120, alignItems: "center" }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink }} accessibilityLabel={`Reminder time ${formatSlot(practiceMinutes)}`}>{formatSlot(practiceMinutes)}</Text>
              <Text style={{ color: colors.inkSoft, fontSize: 13 }}>every day</Text>
            </View>
            <StepButton label="+" a11y="Later" disabled={practiceMinutes >= LAST_SLOT} onPress={() => set({ practiceMinutes: stepSlot(practiceMinutes, 1) })} />
          </View>
        ) : null}
        <Row label="Tell me when my hearts are full" value={heartsFullEnabled} onChange={(v) => turn({ heartsFullEnabled: v }, v)} />
      </View>
      {perm === "denied" && (practiceEnabled || heartsFullEnabled) ? (
        <Body style={{ color: colors.inkSoft, marginTop: 8, fontSize: 14 }}>Notifications are off for this app. Turn them on in your phone's Settings.</Body>
      ) : null}
    </Card>
  );
}
