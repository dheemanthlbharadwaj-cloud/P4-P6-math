import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { getTopics } from "../../src/content";
import { useProfile } from "../../src/store/profile";
import { colors, MIN_TOUCH, radius } from "../../src/theme/colors";

export default function TopicsStep() {
  const router = useRouter();
  const grade = useProfile((s) => s.grade);
  const [sel, setSel] = useState<string[]>(useProfile.getState().topicsLearnt);
  const topics = getTopics(grade);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <OnboardingFrame step={4} title="Which topics have you learnt?" subtitle="These maps start open. The others are covered by clouds until you find the key." onBack={() => router.back()}
      onNext={() => { useProfile.getState().set({ topicsLearnt: sel }); router.push("/(onboarding)/cat"); }}
      nextLabel={sel.length ? `Next (${sel.length} chosen)` : "Next (none yet)"}>
      <View style={{ gap: 10 }}>
        {topics.map((t) => {
          const on = sel.includes(t.id);
          return (
            <Pressable key={t.id} onPress={() => toggle(t.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
              style={{ minHeight: MIN_TOUCH + 4, flexDirection: "row", alignItems: "center", padding: 12, borderRadius: radius.m, borderWidth: 3, borderColor: on ? colors.good : colors.border, backgroundColor: on ? colors.goodBg : colors.card }}>
              <View style={{ width: 30, height: 30, borderRadius: 8, borderWidth: 3, borderColor: colors.border, backgroundColor: on ? colors.good : "#fff", alignItems: "center", justifyContent: "center", marginRight: 12 }}>
                {on ? <Text style={{ color: "#fff", fontWeight: "900" }}>✓</Text> : null}
              </View>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.ink, flex: 1 }}>{t.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </OnboardingFrame>
  );
}
