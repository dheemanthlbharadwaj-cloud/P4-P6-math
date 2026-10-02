import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { OnboardingFrame } from "../../src/components/OnboardingFrame";
import { getTopics } from "../../src/content";
import { useProfile } from "../../src/store/profile";
import { colors, MIN_TOUCH } from "../../src/theme/colors";

export default function TopicsStep() {
  const router = useRouter();
  const grade = useProfile((s) => s.grade);
  const [sel, setSel] = useState<string[]>(useProfile.getState().topicsLearnt);
  const topics = getTopics(grade);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <OnboardingFrame step={3} title="What have you learnt so far?" subtitle="Tap every topic you have learnt. Their maps start open; the rest stay under clouds until you find the key." onBack={() => router.back()}
      onNext={() => { useProfile.getState().set({ topicsLearnt: sel }); router.push("/(onboarding)/cat"); }}
      nextLabel={sel.length ? `Next (${sel.length} chosen)` : "Next (none yet)"}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {topics.map((t) => {
          const on = sel.includes(t.id);
          return (
            <Pressable key={t.id} onPress={() => toggle(t.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={t.name}
              style={({ pressed }) => ({
                minHeight: MIN_TOUCH, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 6, paddingRight: 14,
                borderRadius: 999, borderWidth: 3, borderColor: colors.border, backgroundColor: on ? colors.good : colors.card,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              })}>
              <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2.5, borderColor: on ? "#fff" : colors.border, alignItems: "center", justifyContent: "center", backgroundColor: on ? "rgba(255,255,255,0.18)" : colors.highlight }}>
                <Text style={{ fontSize: 18, fontWeight: "900", color: on ? "#fff" : colors.ink, marginTop: -2 }}>{on ? "✓" : "+"}</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: "800", color: on ? "#fff" : colors.ink }}>{t.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </OnboardingFrame>
  );
}
