import React, { useState } from "react";
import { Image as RNImage, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { MAX_ENERGY, MAX_HEARTS } from "@p6/shared";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { Stat } from "../../src/components/TopBar";
import { uiAssets } from "../../src/theme/assets";
import { catAnimations } from "../../src/theme/cats";
import { useProfile } from "../../src/store/profile";
import { colors, radius } from "../../src/theme/colors";

/** A speech bubble with a small tail pointing toward the cat. */
function Bubble({ icon, text, side }: { icon: number; text: string; side: "left" | "right" }) {
  return (
    <View style={{ maxWidth: 150, alignSelf: side === "left" ? "flex-start" : "flex-end" }}>
      <View style={{ backgroundColor: colors.card, borderWidth: 3, borderColor: colors.border, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <RNImage source={icon} style={{ width: 22, height: 22 }} />
        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.ink, flexShrink: 1 }}>{text}</Text>
      </View>
      <View style={{
        position: "absolute", bottom: -8, [side === "left" ? "right" : "left"]: 18, width: 16, height: 16, backgroundColor: colors.card,
        borderRightWidth: 3, borderBottomWidth: 3, borderColor: colors.border, transform: [{ rotate: "45deg" }],
      }} />
    </View>
  );
}

export default function CatStep() {
  const router = useRouter();
  const [name, setName] = useState(useProfile.getState().catName);
  return (
    <OnboardingFrame step={4} title="Meet your cat!" onBack={() => router.back()} nextDisabled={name.trim().length < 1}
      onNext={() => { useProfile.getState().set({ catName: name.trim() }); router.push("/(onboarding)/psle"); }}>
      <View style={{ flexDirection: "row", gap: 10, justifyContent: "center", marginBottom: 14 }}>
        <Stat icon={uiAssets.icons.energy as number} text={`${MAX_ENERGY} energy`} />
        <Stat icon={uiAssets.icons.heart as number} text={`${MAX_HEARTS} hearts`} />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Bubble side="left" icon={uiAssets.icons.energy as number} text="Each level uses 1 energy" />
        <Bubble side="right" icon={uiAssets.icons.heart as number} text="A wrong answer costs a heart" />
      </View>
      <View style={{ alignItems: "center", marginTop: 4 }}>
        <Image source={catAnimations.idle} style={{ width: 190, height: 190 }} contentFit="contain" accessibilityLabel="Your cat" />
      </View>

      <TextInput
        style={{ minHeight: 56, borderWidth: 3, borderColor: colors.border, borderRadius: radius.m, paddingHorizontal: 14, fontSize: 20, backgroundColor: "#fff", color: colors.ink, textAlign: "center", fontWeight: "800" }}
        value={name} onChangeText={setName} placeholder="Name your cat" placeholderTextColor={colors.muted} maxLength={20} accessibilityLabel="Cat name"
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 }}>
        <RNImage source={uiAssets.icons.star} style={{ width: 24, height: 24 }} />
        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.inkSoft }}>Earn stars to buy hats and colours for your cat</Text>
      </View>
    </OnboardingFrame>
  );
}
