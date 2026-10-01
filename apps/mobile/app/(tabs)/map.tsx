import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, Text, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useRouter } from "expo-router";
import type { LevelNo } from "@p6/shared";
import { Screen } from "../../src/components/ui";
import { TopBar } from "../../src/components/TopBar";
import { TopicMapPage } from "../../src/components/TopicMapPage";
import { LevelSheet } from "../../src/components/LevelSheet";
import { KeyModal } from "../../src/components/KeyModal";
import { ResourceModal } from "../../src/components/ResourceModal";
import { getLevelQuestions, getSubtopic, getTopics } from "../../src/content";
import { useProfile } from "../../src/store/profile";
import { useProgress } from "../../src/store/progress";
import { useFriends } from "../../src/store/friends";
import { usePlayer, computeMeters } from "../../src/store/player";
import { isTopicUnlocked } from "../../src/logic/unlock";
import { colors } from "../../src/theme/colors";

export default function MapTab() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const grade = useProfile((s) => s.grade);
  const topics = useMemo(() => getTopics(grade), [grade]);
  const progress = useProgress((s) => s.grades[grade]);
  const friends = useFriends((s) => s.friends);
  const listRef = useRef<FlatList>(null);
  const [index, setIndex] = useState(0);
  // Pages must be exactly as tall as the list viewport; a horizontal list does not stretch its items, and an
  // unstretched page grows to its map image so the map can no longer scroll and the bottom is hidden.
  const [pageHeight, setPageHeight] = useState(0);
  const [sheetSub, setSheetSub] = useState<string | null>(null);
  const [keyTopic, setKeyTopic] = useState<string | null>(null);
  const [gate, setGate] = useState<null | "energy" | "hearts">(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Open on the first unlocked topic.
  const initial = useRef(false);
  useEffect(() => {
    if (initial.current || !progress) return;
    initial.current = true;
    const i = topics.findIndex((t) => isTopicUnlocked(progress, t.id));
    if (i > 0) { setIndex(i); setTimeout(() => listRef.current?.scrollToIndex({ index: i, animated: false }), 0); }
  }, [progress, topics]);

  const go = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(topics.length - 1, i));
    setIndex(clamped);
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
  }, [topics.length]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  const found = sheetSub ? getSubtopic(grade, sheetSub) : undefined;
  const topic = topics[index];

  const start = (level: LevelNo) => {
    if (!found) return;
    if (getLevelQuestions(grade, found.subtopic.id, level).length === 0) { setNotice("This level has no questions yet."); return; }
    const p = usePlayer.getState();
    const m = computeMeters(p, Date.now());
    if (!m.subscribed && m.hearts <= 0) { setGate("hearts"); return; }
    if (!p.spendEnergy()) { setGate("energy"); return; }
    setSheetSub(null);
    router.push({ pathname: "/level/[grade]/[nodeId]/[level]", params: { grade, nodeId: found.subtopic.id, level: String(level) } });
  };

  return (
    <Screen>
      <TopBar />
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.bg, borderBottomWidth: 3, borderBottomColor: colors.border }}>
        <Pressable onPress={() => go(index - 1)} disabled={index === 0} accessibilityLabel="Previous topic" style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", opacity: index === 0 ? 0.3 : 1 }}>
          <Text style={{ fontSize: 30, fontWeight: "900", color: colors.ink }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "900", color: colors.ink }} numberOfLines={1} accessibilityRole="header">{topic?.name ?? ""}</Text>
          <Text style={{ fontSize: 12, color: colors.inkSoft, fontWeight: "700" }}>{index + 1} / {topics.length} · swipe for more topics</Text>
        </View>
        <Pressable onPress={() => go(index + 1)} disabled={index >= topics.length - 1} accessibilityLabel="Next topic" style={{ width: 48, height: 48, alignItems: "center", justifyContent: "center", opacity: index >= topics.length - 1 ? 0.3 : 1 }}>
          <Text style={{ fontSize: 30, fontWeight: "900", color: colors.ink }}>›</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
        data={topics}
        keyExtractor={(t) => t.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onEnd}
        windowSize={3}
        initialNumToRender={1}
        renderItem={({ item }) => (
          <TopicMapPage
            topic={item}
            width={width}
            height={pageHeight}
            unlocked={isTopicUnlocked(progress, item.id)}
            progress={progress}
            friends={friends}
            onNodePress={setSheetSub}
            onLockPress={() => setKeyTopic(item.id)}
          />
        )}
      />

      <LevelSheet subtopic={found?.subtopic ?? null} progress={progress} onClose={() => setSheetSub(null)} onStart={start} />
      <KeyModal grade={grade} topic={topics.find((t) => t.id === keyTopic) ?? null} visible={!!keyTopic} onClose={() => setKeyTopic(null)} />
      <ResourceModal kind="energy" visible={gate === "energy"} onRewarded={() => setGate(null)} onGiveUp={() => setGate(null)} giveUpLabel="Not now" />
      <ResourceModal kind="hearts" visible={gate === "hearts"} onRewarded={() => setGate(null)} onGiveUp={() => setGate(null)} giveUpLabel="Not now" />
      {notice ? (
        <Pressable onPress={() => setNotice(null)} style={{ position: "absolute", bottom: 16, alignSelf: "center", backgroundColor: colors.ink, padding: 12, borderRadius: 12 }}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>{notice}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
