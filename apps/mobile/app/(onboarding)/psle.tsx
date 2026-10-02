import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { catPoses } from "../../src/theme/cats";
import { DateField, isValidIso } from "../../src/components/DateStepper";
import { daysToPsle, useProfile } from "../../src/store/profile";
import { useProgress } from "../../src/store/progress";
import { colors, fonts } from "../../src/theme/colors";

export default function PsleStep() {
  const router = useRouter();
  const [date, setDate] = useState(useProfile.getState().psleDate);
  const fullName = useProfile((s) => s.fullName);
  const first = fullName.trim().split(/\s+/)[0] || "champ";
  const valid = isValidIso(date);
  const days = valid ? daysToPsle(date) : null;
  return (
    <OnboardingFrame cat={catPoses.chasing} step={5} title="" onBack={() => router.back()} nextLabel="Let's go!" nextDisabled={!valid}
      onNext={() => {
        const p = useProfile.getState();
        p.set({ psleDate: date, onboarded: true });
        useProgress.getState().ensureGrade(p.grade, p.topicsLearnt);
        router.replace("/(tabs)/map");
      }}>
      <View style={{ alignItems: "center", marginTop: 10, marginBottom: 26 }}>
        <Text style={{ fontSize: 96, lineHeight: 104, fontFamily: fonts.display, color: colors.primary, fontVariant: ["tabular-nums"] }} accessibilityLabel={`${days ?? "unknown"} days to PSLE`}>{days ?? "?"}</Text>
        <Text style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink }}>Days to PSLE!</Text>
        <Text style={{ fontSize: 19, fontWeight: "700", color: colors.inkSoft, marginTop: 10, textAlign: "center" }}>Let's make every day count, {first}!</Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.inkSoft, marginBottom: 6 }}>First PSLE paper (change it if your school told you a different date)</Text>
      <DateField value={date} onChange={setDate} />
    </OnboardingFrame>
  );
}
