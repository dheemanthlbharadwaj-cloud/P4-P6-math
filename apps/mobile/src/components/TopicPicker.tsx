// "Topics" list on the Map tab: a side drawer with every topic map in order (number, name, progress). Tapping one
// jumps the map pager to it. The maps in view are highlighted.
import React from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Grade, GradeProgress, TopicMap } from "@p6/shared";
import { getLevelIds } from "../content";
import { isTopicInView, topicSummary } from "../logic/topicPicker";
import { isTopicUnlocked } from "../logic/unlock";
import { colors, font, fonts, radius, space } from "../theme/colors";
import { ProgressBar } from "./ui";

export function TopicPicker({
  visible, onClose, onPick, topics, grade, progress, index, perView,
}: {
  visible: boolean; onClose: () => void; onPick: (i: number) => void;
  topics: TopicMap[]; grade: Grade; progress: GradeProgress | undefined; index: number; perView: number;
}) {
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(340, Math.round(width * 0.88));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, flexDirection: "row", backgroundColor: "rgba(20,20,40,0.55)" }}>
        <SafeAreaView edges={["top", "bottom", "left"]} style={{ width: drawerWidth, backgroundColor: colors.bg, borderRightWidth: 3, borderColor: colors.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: space.l, paddingRight: space.s, borderBottomWidth: 3, borderBottomColor: colors.border }}>
            <Text style={{ flex: 1, fontSize: font.h2, fontFamily: fonts.display, color: colors.ink }} accessibilityRole="header">Topics</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close topics" style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink }}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: space.m, gap: space.s }}>
            {topics.map((t, i) => {
              const sum = topicSummary(progress, t.subtopics.map((s) => s.id), (id, lv) => getLevelIds(grade, id, lv));
              const current = isTopicInView(i, index, perView);
              const open = isTopicUnlocked(progress, t.id);
              const hint = open ? `${sum.done} of ${sum.total} levels` : "Locked";
              return (
                <Pressable
                  key={t.id}
                  onPress={() => onPick(i)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current }}
                  accessibilityLabel={`Topic ${i + 1}, ${t.name}, ${hint}${current ? ", showing now" : ""}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.m, minHeight: 60, padding: space.s, borderRadius: radius.m, borderWidth: 3, borderColor: colors.border, backgroundColor: current ? colors.highlight : colors.card }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.border, backgroundColor: current ? colors.accent : open ? colors.primary : colors.muted }}>
                    <Text style={{ fontSize: 16, fontFamily: fonts.display, color: current ? colors.ink : "#fff" }}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.small + 1, fontFamily: fonts.displayMedium, color: colors.ink }} numberOfLines={2}>{t.name}</Text>
                    {open ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, marginTop: 2 }}>
                        <ProgressBar value={sum.total ? sum.done / sum.total : 0} style={{ flex: 1, height: 10 }} />
                        <Text style={{ fontSize: 12, color: colors.inkSoft, fontWeight: "700" }}>{sum.done}/{sum.total}</Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: colors.inkSoft, fontWeight: "700", marginTop: 2 }}>Locked</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </SafeAreaView>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close topics" />
      </View>
    </Modal>
  );
}
