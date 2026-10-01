import React from "react";
import { Image, Text } from "react-native";
import { Tabs } from "expo-router";
import { uiAssets } from "../../src/theme/assets";
import { colors } from "../../src/theme/colors";

type TabKey = keyof typeof uiAssets.tabs;
const icon = (key: TabKey) => ({ focused }: { focused: boolean }) => (
  <Image source={uiAssets.tabs[key]} style={{ width: 30, height: 30, opacity: focused ? 1 : 0.5 }} accessibilityIgnoresInvertColors />
);
const label = (text: string) => ({ focused }: { focused: boolean }) => (
  <Text style={{ fontSize: 11, fontWeight: "900", color: focused ? colors.primary : colors.inkSoft }}>{text}</Text>
);

// Order is fixed by the spec: Map, Book (Classroom), Cat (Store), Trophy (Leaderboard), Person (Profile).
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopWidth: 3, borderTopColor: colors.border, minHeight: 64 },
        tabBarItemStyle: { paddingVertical: 4, minHeight: 56 },
      }}
    >
      <Tabs.Screen name="map" options={{ title: "Map", tabBarIcon: icon("map"), tabBarLabel: label("Map") }} />
      <Tabs.Screen name="classroom" options={{ title: "Classroom", tabBarIcon: icon("book"), tabBarLabel: label("Classroom") }} />
      <Tabs.Screen name="store" options={{ title: "Cat Store", tabBarIcon: icon("cat"), tabBarLabel: label("Cat") }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Leaderboard", tabBarIcon: icon("trophy"), tabBarLabel: label("Trophy") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person"), tabBarLabel: label("Profile") }} />
    </Tabs>
  );
}
