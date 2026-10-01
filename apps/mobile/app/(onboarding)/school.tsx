import React, { useState } from "react";
import { TextInput } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { useProfile } from "../../src/store/profile";
import { colors, radius } from "../../src/theme/colors";

export default function SchoolStep() {
  const router = useRouter();
  const [school, setSchool] = useState(useProfile.getState().school);
  return (
    <OnboardingFrame step={3} title="Which school are you in?" nextDisabled={school.trim().length < 2} onBack={() => router.back()}
      onNext={() => { useProfile.getState().set({ school: school.trim() }); router.push("/(onboarding)/topics"); }}>
      <TextInput
        style={{ minHeight: 56, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 20, backgroundColor: "#fff", color: colors.ink }}
        value={school} onChangeText={setSchool} placeholder="School name" placeholderTextColor={colors.muted} autoCapitalize="words" accessibilityLabel="School" maxLength={80}
      />
    </OnboardingFrame>
  );
}
