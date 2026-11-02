// "Teacher · Admin" switch shown in the staff frames when the login is an admin (parents never see it).
import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../store/auth";
import { AREAS, areasFor, rememberArea, useRoles, type Area } from "../roles/store";
import { Pill } from "./dash";

export function AreaSwitcher({ current }: { current: Area }) {
  const router = useRouter();
  const uid = useAuth((s) => s.user?.uid) ?? "mock";
  const { phase, roles } = useRoles();
  const offered = areasFor(phase, roles);
  if (offered.length < 2) return null;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {AREAS.filter((a) => offered.includes(a.id)).map((a) => (
        <Pill key={a.id} label={a.label} selected={a.id === current} onPress={() => { if (a.id !== current) { rememberArea(uid, a.id); router.replace(`/${a.id}`); } }} />
      ))}
    </View>
  );
}
