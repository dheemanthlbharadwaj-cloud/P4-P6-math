import React from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Button, H1, Screen } from "./ui";
import { catHead } from "../theme/cats";
import { colors, space } from "../theme/colors";

/** Progress as a row of cat heads: done and current are solid, the current one is bigger, the rest are faint. */
function CatHeads({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: 10 }} accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${total}`} accessibilityValue={{ min: 1, max: total, now: step }}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const size = n === step ? 40 : 28;
        return <Image key={n} source={catHead} style={{ width: size, height: size, opacity: n <= step ? 1 : 0.18 }} resizeMode="contain" />;
      })}
    </View>
  );
}

export function OnboardingFrame({
  step, total = 5, title, subtitle, children, onNext, nextLabel = "Next", nextDisabled, onBack,
}: {
  step: number; total?: number; title: string; subtitle?: string; children: React.ReactNode;
  onNext: () => void; nextLabel?: string; nextDisabled?: boolean; onBack?: () => void;
}) {
  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: space.l, paddingTop: space.s }}>
          <CatHeads step={step} total={total} />
        </View>
        <ScrollView contentContainerStyle={{ padding: space.l, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {title ? <H1>{title}</H1> : null}
          {subtitle ? <Text style={{ fontSize: 17, color: colors.inkSoft, marginTop: 6, marginBottom: space.l }}>{subtitle}</Text> : <View style={{ height: space.l }} />}
          {children}
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 12, padding: space.l }}>
          {onBack ? <Button title="Back" variant="ghost" onPress={onBack} style={{ flex: 1 }} /> : null}
          <Button title={nextLabel} onPress={onNext} disabled={nextDisabled} style={{ flex: 2 }} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
