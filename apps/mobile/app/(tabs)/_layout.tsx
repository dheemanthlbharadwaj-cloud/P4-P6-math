import React from "react";
import { Image, Text } from "react-native";
import { Tabs } from "expo-router";
import { uiAssets } from "../../src/theme/assets";
import { colors, fonts } from "../../src/theme/colors";

type TabKey = keyof typeof uiAssets.tabs;
const icon = (key: TabKey) => ({ focused }: { focused: boolean }) => (
  <Image source={uiAssets.tabs[key]} style={{ width: 30, height: 30, opacity: focused ? 1 : 0.5 }} accessibilityIgnoresInvertColors />
);
const label = (text: string) => ({ focused }: { focused: boolean }) => (
  <Text adjustsFontSizeToFit minimumFontScale={0.7} allowFontScaling={false} style={{ fontSize: text.length > 8 ? 11 : 12, letterSpacing: -0.2, fontFamily: fonts.display, color: focused ? colors.primary : colors.inkSoft, flexShrink: 0 }}>{text}</Text>
);

// Order is fixed by the spec: Map, Book (Classroom), Cat (Store), Trophy (Leaderboard), Person (Profile).
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopWidth: 3, borderTopColor: colors.border, minHeight: 64 },
        tabBarItemStyle: { paddingVertical: 4, minHeight: 56, paddingHorizontal: 0 },
      }}
    >
      <Tabs.Screen name="map" options={{ title: "Map", tabBarIcon: icon("map"), tabBarLabel: label("Map") }} />
      <Tabs.Screen name="classroom" options={{ title: "Classroom", tabBarIcon: icon("book"), tabBarLabel: label("Classroom") }} />
      <Tabs.Screen name="store" options={{ title: "Cat Shop", tabBarIcon: icon("cat"), tabBarLabel: label("Cat Shop") }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Leaderboard", tabBarIcon: icon("trophy"), tabBarLabel: label("Leaderboard") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person"), tabBarLabel: label("Profile") }} />
    </Tabs>
  );
}
