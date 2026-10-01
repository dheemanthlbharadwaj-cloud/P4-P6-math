import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { CatAvatar } from "../../src/components/CatAvatar";
import { catPoses } from "../../src/theme/cats";
import { useProfile } from "../../src/store/profile";
import { colors, radius } from "../../src/theme/colors";

export default function CatStep() {
  const router = useRouter();
  const [name, setName] = useState(useProfile.getState().catName);
  return (
    <OnboardingFrame step={5} title="Name your cat!" onBack={() => router.back()} nextDisabled={name.trim().length < 1}
      onNext={() => { useProfile.getState().set({ catName: name.trim() }); router.push("/(onboarding)/psle"); }}>
      <View style={{ alignItems: "center", marginBottom: 16 }}>
        <CatAvatar source={catPoses.curious} size={170} />
      </View>
      <View style={{ backgroundColor: colors.card, borderRadius: radius.l, borderWidth: 3, borderColor: colors.border, padding: 14, marginBottom: 16 }}>
        <Text style={{ fontSize: 16, color: colors.ink, lineHeight: 23 }}>
          Your cat is your study buddy. It sits beside every question, cheers when you are right, and gets confused when you slip.
          Earn stars to buy it hats and new colours. Your friends will see it on the map!
        </Text>
      </View>
      <TextInput
        style={{ minHeight: 56, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 20, backgroundColor: "#fff", color: colors.ink }}
        value={name} onChangeText={setName} placeholder="Cat's name" placeholderTextColor={colors.muted} maxLength={20} accessibilityLabel="Cat name"
      />
    </OnboardingFrame>
  );
}
