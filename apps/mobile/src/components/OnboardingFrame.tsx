import React from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Button, H1, ProgressBar, Screen } from "./ui";
import { colors, space } from "../theme/colors";

export function OnboardingFrame({
  step, total = 6, title, subtitle, children, onNext, nextLabel = "Next", nextDisabled, onBack,
}: {
  step: number; total?: number; title: string; subtitle?: string; children: React.ReactNode;
  onNext: () => void; nextLabel?: string; nextDisabled?: boolean; onBack?: () => void;
}) {
  return (
    <Screen edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingHorizontal: space.l, paddingTop: space.s }}>
          <Text style={{ color: colors.inkSoft, fontWeight: "800", marginBottom: 4 }}>Step {step} of {total}</Text>
          <ProgressBar value={step / total} />
        </View>
        <ScrollView contentContainerStyle={{ padding: space.l, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <H1>{title}</H1>
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
