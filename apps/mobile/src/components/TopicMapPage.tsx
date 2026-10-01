// One topic = one map page. Subtopic nodes wind up a path; friends' mini cats stand next to nodes.
import React, { useMemo, useRef } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { GradeProgress, PublicProfile, TopicMap } from "@p6/shared";
import { CatAvatar } from "./CatAvatar";
import { mapThemeFor, uiAssets } from "../theme/assets";
import { catPoses } from "../theme/cats";
import { isLevelComplete } from "../logic/unlock";
import { colors } from "../theme/colors";

const NODE = 56; // fits the narrowest measured water spot on every map (see scripts/map-paths.py)

export interface TopicMapPageProps {
  topic: TopicMap;
  width: number;
  unlocked: boolean;
  progress: GradeProgress | undefined;
  friends: PublicProfile[];
  onNodePress: (subtopicId: string) => void;
  onLockPress: () => void;
}

/** Even spots along the route (t = 0 top … 1 bottom), first subtopic at the bottom. */
function evenSpots(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 0.94 - (0.88 * (i + 0.5)) / Math.max(1, n));
}

/** Arc-length parametrised water route scaled to the page. */
function buildRoute(path: [number, number, 0 | 1][], width: number, height: number) {
  const pts = path.map(([x, y, open]) => ({ x: x * width, y: y * height, open: open === 1 }));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const length = cum[cum.length - 1] || 1;
  const at = (t: number) => {
    const d = Math.min(1, Math.max(0, t)) * length;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const f = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const p = pts[i - 1], q = pts[i];
    return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, open: p.open && q.open };
  };
  return { at, length };
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function TopicMapPage({ topic, width, unlocked, progress, friends, onNodePress, onLockPress }: TopicMapPageProps) {
  const ref = useRef<ScrollView>(null);
  const subs = useMemo(() => [...topic.subtopics].sort((a, b) => a.order - b.order), [topic]);
  const n = subs.length;
  const theme = mapThemeFor(topic.order);
  const height = width * theme.aspect;
  // Nodes sit on spots measured from the art: open water, clear of buildings and objects. Other node counts
  // (P4/P5 later) fall back to even spacing along the same water route.
  const route = useMemo(() => buildRoute(theme.route.path, width, height), [theme, width, height]);
  const ts = theme.route.nodes.length === n ? theme.route.nodes : evenSpots(n);
  const pos = ts.map((t) => { const p = route.at(t); return { x: p.x, y: p.y - NODE / 2 }; });
  const currentIdx = subs.findIndex((s) => !([1, 2, 3] as const).every((l) => isLevelComplete(progress, s.id, l)));

  // Trail dots follow the water route between consecutive nodes, skipping stretches hidden behind objects.
  const dots: { x: number; y: number; k: string }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = ts[i], b = ts[i + 1];
    const steps = Math.max(2, Math.round((Math.abs(b - a) * route.length) / 26));
    for (let k = 1; k < steps; k++) {
      const p = route.at(a + ((b - a) * k) / steps);
      if (p.open && Math.hypot(p.x - pos[i].x, p.y - pos[i].y - NODE / 2) > NODE * 0.7 && Math.hypot(p.x - pos[i + 1].x, p.y - pos[i + 1].y - NODE / 2) > NODE * 0.7) {
        dots.push({ x: p.x, y: p.y - NODE / 2, k: `${i}-${k}` });
      }
    }
  }

  return (
    <View style={{ width, flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "#5fd3e0" }}>
        <ScrollView ref={ref} contentContainerStyle={{ height }} onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })} showsVerticalScrollIndicator={false}>
          <Image source={theme.bg} style={{ position: "absolute", top: 0, left: 0, width, height }} resizeMode="cover" accessibilityIgnoresInvertColors />
          {dots.map((d) => (
            <View key={d.k} style={[styles.dot, { left: d.x - 5, top: d.y + NODE / 2 - 5 }]} />
          ))}
          {subs.map((s, i) => {
            const done = ([1, 2, 3] as const).filter((l) => isLevelComplete(progress, s.id, l));
            const gold = done.length === 3;
            const src = !unlocked ? uiAssets.node.locked : gold ? uiAssets.node.gold : i === currentIdx ? uiAssets.node.current : uiAssets.node.default;
            return (
              <View key={s.id} style={[styles.nodeWrap, { left: pos[i].x - NODE / 2, top: pos[i].y }]}>
                <Pressable
                  onPress={() => onNodePress(s.id)}
                  disabled={!unlocked}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.name}. ${done.length} of 3 levels complete`}
                  hitSlop={8}
                >
                  <Image source={src} style={{ width: NODE, height: NODE }} />
                </Pressable>
                <View style={styles.pips}>
                  {([1, 2, 3] as const).map((l) => (
                    <View key={l} style={[styles.pip, isLevelComplete(progress, s.id, l) && { backgroundColor: colors.gold }]} />
                  ))}
                </View>
              </View>
            );
          })}
          {unlocked
            ? friends.slice(0, 8).map((f) => {
                // TODO(backend): friends' real map position is not in the API yet; pin them to a stable node by uid hash.
                const i = hash(f.uid) % Math.max(1, n);
                // Stand on the water route just below the node (toward the previous one), never on scenery.
                const gap = i > 0 ? ts[i - 1] - ts[i] : 0.94 - ts[i];
                const spot = route.at(ts[i] + Math.max(0.012, gap * 0.4));
                const x = Math.min(width - 64, Math.max(0, spot.x - 32));
                return (
                  <View key={f.uid} style={[styles.friend, { left: x, top: spot.y - 22 }]} pointerEvents="none">
                    <CatAvatar source={catPoses.curious} colorId={f.cat.colorId} hatId={f.cat.hatId} size={44} />
                    <Text style={styles.friendName} numberOfLines={1}>{f.displayName}</Text>
                  </View>
                );
              })
            : null}
        </ScrollView>

        {!unlocked ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onLockPress} accessibilityRole="button" accessibilityLabel={`${topic.name} is locked. Tap to find the key.`}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.6)" }]} />
            {[0.05, 0.3, 0.55, 0.8].map((top, i) => (
              <Image key={i} source={uiAssets.overlays.cloud} resizeMode="contain" style={{ position: "absolute", width: width * 0.8, height: width * 0.4, top: `${top * 100}%`, left: i % 2 ? width * 0.3 : -width * 0.1, opacity: 0.9 }} />
            ))}
            <View style={styles.lockWrap}>
              <Image source={uiAssets.overlays.lock} style={{ width: 96, height: 96 }} />
              <View style={styles.keyBadge}><Text style={styles.keyText}>Tap to find the key</Text></View>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 2, borderColor: "rgba(61,43,43,0.6)" },
  nodeWrap: { position: "absolute", width: NODE, alignItems: "center" },
  pips: { flexDirection: "row", gap: 4, marginTop: -2 },
  pip: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff", borderWidth: 2, borderColor: colors.border },
  friend: { position: "absolute", width: 64, alignItems: "center" },
  friendName: { fontSize: 11, fontWeight: "900", color: colors.ink, backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 4, borderRadius: 6, overflow: "hidden", maxWidth: 70 },
  lockWrap: { position: "absolute", bottom: 40, left: 0, right: 0, alignItems: "center" },
  keyBadge: { backgroundColor: colors.accent, borderRadius: 20, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 16, minHeight: 44, justifyContent: "center", marginTop: 4 },
  keyText: { fontWeight: "900", color: colors.ink, fontSize: 16 },
});
