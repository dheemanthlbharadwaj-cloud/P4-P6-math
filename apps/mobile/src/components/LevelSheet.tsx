// Bottom sheet shown when a subtopic node is tapped: subtopic name + Level 1/2/3 selection.
import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { STARS_PER_LEVEL, type GradeProgress, type LevelNo, type SubtopicNode } from "@p6/shared";
import { Body, H2, Sheet } from "./ui";
import { uiAssets } from "../theme/assets";
import { isLevelComplete, isLevelUnlocked } from "../logic/unlock";
import { colors } from "../theme/colors";

export function LevelSheet({ subtopic, progress, onClose, onStart }: { subtopic: SubtopicNode | null; progress: GradeProgress | undefined; onClose: () => void; onStart: (level: LevelNo) => void }) {
  return (
    <Sheet visible={!!subtopic} onClose={onClose}>
      {subtopic ? (
        <View>
          <H2 style={{ textAlign: "center" }}>{subtopic.name}</H2>
          <Body style={{ textAlign: "center", color: colors.inkSoft, marginBottom: 12 }}>Pick a level. Each has 5 questions and costs 1 energy.</Body>
          <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
            {([1, 2, 3] as LevelNo[]).map((l) => {
              const done = isLevelComplete(progress, subtopic.id, l);
              const open = isLevelUnlocked(progress, subtopic.id, l);
              const short = subtopic.shortfall?.[l];
              const count = 5 - (short ?? 0);
              return (
                <Pressable key={l} onPress={() => open && onStart(l)} disabled={!open} accessibilityRole="button" accessibilityState={{ disabled: !open }}
                  accessibilityLabel={`Level ${l}${done ? ", complete" : open ? "" : ", locked"}`} style={{ alignItems: "center", minWidth: 96, minHeight: 120 }}>
                  <View>
                    <Image source={done ? uiAssets.level.gold : uiAssets.level[l]} style={{ width: 88, height: 88, opacity: open ? 1 : 0.35 }} />
                    {!open ? <Image source={uiAssets.overlays.lock} style={{ position: "absolute", width: 40, height: 40, left: 24, top: 24 }} /> : null}
                  </View>
                  <Text style={{ fontWeight: "900", fontSize: 16, color: colors.ink }}>Level {l}</Text>
                  <Text style={{ fontSize: 13, color: colors.inkSoft, fontWeight: "700" }}>
                    {done ? "Complete" : `${STARS_PER_LEVEL[l]} star${STARS_PER_LEVEL[l] > 1 ? "s" : ""}`}{count < 5 ? ` · ${count} Qs` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
