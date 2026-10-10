import React from "react";
import { Image, Text } from "react-native";
import { Tabs } from "expo-router";
import { uiAssets } from "../../src/theme/assets";
import { colors, fonts } from "../../src/theme/colors";
import { SIDE_NAV, useLayout } from "../../src/theme/layout";

type TabKey = keyof typeof uiAssets.tabs;
const icon = (key: TabKey) => ({ focused }: { focused: boolean }) => (
  <Image source={uiAssets.tabs[key]} style={{ width: 30, height: 30, opacity: focused ? 1 : 0.5 }} accessibilityIgnoresInvertColors />
);
const label = (text: string) => ({ focused }: { focused: boolean }) => (
  <Text adjustsFontSizeToFit minimumFontScale={0.7} allowFontScaling={false} style={{ fontSize: text.length > 8 ? 11 : 12, letterSpacing: -0.2, fontFamily: fonts.display, color: focused ? colors.primary : colors.inkSoft, flexShrink: 0 }}>{text}</Text>
);
// Desktop side navigation: icon and name side by side, bigger type.
const sideLabel = (text: string) => ({ focused }: { focused: boolean }) => (
  <Text allowFontScaling={false} style={{ fontSize: 17, fontFamily: fonts.display, color: focused ? colors.primary : colors.inkSoft, marginLeft: 12 }}>{text}</Text>
);

// Order is fixed by the spec: Map, Book (Classroom), Cat (Store), Trophy (Leaderboard), Person (Profile).
// Phones: tab bar at the bottom. Tablets: icon rail on the left. Desktops: side menu with names.
export default function TabsLayout() {
  const { kind } = useLayout();
  const lbl = kind === "desktop" ? sideLabel : label;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        ...(kind === "phone"
          ? {
              tabBarStyle: { backgroundColor: colors.bg, borderTopWidth: 3, borderTopColor: colors.border, minHeight: 64 },
              tabBarItemStyle: { paddingVertical: 4, minHeight: 56, paddingHorizontal: 0 },
            }
          : {
              tabBarPosition: "left" as const,
              // A side rail with the name under the icon is the "material" style; names beside icons are "uikit".
              tabBarVariant: kind === "desktop" ? ("uikit" as const) : ("material" as const),
              tabBarLabelPosition: kind === "desktop" ? ("beside-icon" as const) : ("below-icon" as const),
              tabBarStyle: { backgroundColor: colors.bg, borderRightWidth: 3, borderRightColor: colors.border, borderTopWidth: 0, width: SIDE_NAV[kind], minWidth: SIDE_NAV[kind], maxWidth: SIDE_NAV[kind], paddingTop: 16, paddingStart: 0, paddingEnd: 0 },
              tabBarItemStyle: kind === "desktop"
                ? { flexDirection: "row", justifyContent: "flex-start", paddingHorizontal: 18, minHeight: 60, maxHeight: 60, borderRadius: 14, marginHorizontal: 8, marginVertical: 3 }
                : { minHeight: 76, maxHeight: 76, paddingVertical: 6 },
              tabBarActiveBackgroundColor: colors.friend,
            }),
      }}
    >
      <Tabs.Screen name="map" options={{ title: "Map", tabBarIcon: icon("map"), tabBarLabel: lbl("Map") }} />
      <Tabs.Screen name="classroom" options={{ title: "Classroom", tabBarIcon: icon("book"), tabBarLabel: lbl("Classroom") }} />
      <Tabs.Screen name="store" options={{ title: "Cat Shop", tabBarIcon: icon("cat"), tabBarLabel: lbl("Cat Shop") }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Leaderboard", tabBarIcon: icon("trophy"), tabBarLabel: lbl("Leaderboard") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person"), tabBarLabel: lbl("Profile") }} />
    </Tabs>
  );
}
