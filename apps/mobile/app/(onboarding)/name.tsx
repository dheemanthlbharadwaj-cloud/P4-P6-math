import React, { useState } from "react";
import { Text, TextInput } from "react-native";
import { nameProblem, nameProblemMessage, tidyName } from "@p6/shared";
import { useRouter } from "expo-router";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { catPoses } from "../../src/theme/cats";
import { useProfile } from "../../src/store/profile";
import { colors, radius } from "../../src/theme/colors";

const textInputStyle = { minHeight: 56, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 20, backgroundColor: "#fff", color: colors.ink } as const;

export default function NameStep() {
  const router = useRouter();
  const [name, setName] = useState(useProfile.getState().fullName);
  // Everyone on the leaderboard sees it: same rule as the server (no links, numbers or rude words).
  const problem = name.trim() ? nameProblem(name, 60) : null;
  return (
    <OnboardingFrame cat={catPoses.curious} step={1} title="What is your full name?" subtitle="Your friends will see this on the leaderboard." nextDisabled={name.trim().length < 2 || !!problem}
      onNext={() => { useProfile.getState().set({ fullName: tidyName(name) }); router.push("/(onboarding)/school"); }}>
      <TextInput style={textInputStyle} value={name} onChangeText={setName} placeholder="Enter your full name" placeholderTextColor={colors.muted} autoCapitalize="words" autoComplete="name" accessibilityLabel="Full name" maxLength={60} />
      {problem ? <Text style={{ color: colors.bad, fontWeight: "800", marginTop: 8 }}>{nameProblemMessage(problem)}</Text> : null}
    </OnboardingFrame>
  );
}
