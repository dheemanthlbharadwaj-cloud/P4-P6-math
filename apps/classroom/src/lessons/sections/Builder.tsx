// Worksheet builder (next phase): Leitner baskets from each child's mistakes. Waiting for the question content.
import React from "react";
import { Text, View } from "react-native";
import { Muted, PageHeader, Panel } from "../../components/dash";
import { colors, fonts, space } from "../../theme/colors";

export function BuilderSection() {
  return (
    <View>
      <PageHeader title="Worksheet builder" subtitle="Coming next, once lessons have questions." />
      <Panel title="How it will work">
        {[
          "1. Pick topics (all by default).",
          "2. Pick completed and/or uncompleted question types.",
          "3. Pick new mistakes, previous mistakes and/or correct answers.",
          "Out come up to three sections (Leitner system): Basket 1 = review every day, Basket 2 = every other day, Basket 3 = once a week. You see how many question types each basket has and choose how many questions to take.",
          "Save it with a name, then do it in the same test format or download it as a PDF.",
        ].map((t) => <Text key={t} style={{ fontSize: 15, color: colors.ink, marginBottom: space.s, fontFamily: t.startsWith("Out") ? fonts.displayMedium : undefined }}>{t}</Text>)}
        <Muted>Worksheets and the builder need the question content of Catapult Mathletes and Catapult Scientists in the lessons first.</Muted>
      </Panel>
    </View>
  );
}
