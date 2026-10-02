import React, { useState } from "react";
import { TextInput } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { catPoses } from "../../src/theme/cats";
import { useProfile } from "../../src/store/profile";
import { colors, radius } from "../../src/theme/colors";

const textInputStyle = { minHeight: 56, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 20, backgroundColor: "#fff", color: colors.ink } as const;

export default function NameStep() {
  const router = useRouter();
  const [name, setName] = useState(useProfile.getState().fullName);
  return (
    <OnboardingFrame cat={catPoses.curious} step={1} title="What is your full name?" subtitle="Your friends will see this on the leaderboard." nextDisabled={name.trim().length < 2}
      onNext={() => { useProfile.getState().set({ fullName: name.trim() }); router.push("/(onboarding)/school"); }}>
      <TextInput style={textInputStyle} value={name} onChangeText={setName} placeholder="Enter your full name" placeholderTextColor={colors.muted} autoCapitalize="words" autoComplete="name" accessibilityLabel="Full name" maxLength={60} />
    </OnboardingFrame>
  );
}
