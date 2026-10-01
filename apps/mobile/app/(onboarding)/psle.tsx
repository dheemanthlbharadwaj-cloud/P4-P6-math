import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { DateField, isValidIso } from "../../src/components/DateStepper";
import { daysToPsle, useProfile } from "../../src/store/profile";
import { useProgress } from "../../src/store/progress";
import { colors } from "../../src/theme/colors";

export default function PsleStep() {
  const router = useRouter();
  const [date, setDate] = useState(useProfile.getState().psleDate);
  const valid = isValidIso(date);
  const days = valid ? daysToPsle(date) : null;
  return (
    <OnboardingFrame step={6} title="Days to PSLE" subtitle="We guessed the first PSLE paper date. Change it if your school told you otherwise." onBack={() => router.back()} nextLabel="Let's go!" nextDisabled={!valid}
      onNext={() => {
        const p = useProfile.getState();
        p.set({ psleDate: date, onboarded: true });
        useProgress.getState().ensureGrade(p.grade, p.topicsLearnt);
        router.replace("/(tabs)/map");
      }}>
      <View style={{ alignItems: "center", marginBottom: 20 }}>
        <Text style={{ fontSize: 72, fontWeight: "900", color: colors.primary }}>{days ?? "?"}</Text>
        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}>days to go</Text>
      </View>
      <DateField value={date} onChange={setDate} />
    </OnboardingFrame>
  );
}
