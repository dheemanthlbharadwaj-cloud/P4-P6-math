// Wide screens (tablets, desktops): sign-in and onboarding as two halves, the cat and title on the left, the form on the
// right, instead of a phone-width column. Phones never use it.
import React from "react";
import { View } from "react-native";
import { colors, space } from "../theme/colors";

export function HeroSplit({ hero, children }: { hero: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, flexDirection: "row" }}>
      <View style={{ flex: 1, backgroundColor: colors.highlight, borderRightWidth: 3, borderColor: colors.border, alignItems: "center", justifyContent: "center", padding: space.xl }}>
        {hero}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

/** The form side: centred, at a comfortable reading width. */
export const formColumn = { width: "100%", maxWidth: 520, alignSelf: "center" } as const;
