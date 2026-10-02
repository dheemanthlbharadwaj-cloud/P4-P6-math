// One topic = one map page. Subtopic nodes wind up a path; friends' mini cats stand next to nodes.
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { GradeProgress, PublicProfile, TopicMap } from "@p6/shared";
import { CatAvatar } from "./CatAvatar";
import { mapThemeFor, uiAssets } from "../theme/assets";
import { catPoses } from "../theme/cats";
import { useCosmetics } from "../store/cosmetics";
import { isLevelComplete } from "../logic/unlock";
import { colors, fonts } from "../theme/colors";

const NODE = 56; // fits the narrowest measured water spot on every map (see scripts/map-sections.py)
const LABEL_W = 132; // node column width: button, stars and the subtopic name underneath
// Clouds covering a locked map: [left, top] as fractions of the page, and width as a fraction of page width.
const CLOUDS: [number, number, number][] = [
  [-0.18, 0.0, 0.75], [0.42, 0.04, 0.7], [0.1, 0.16, 0.62], [-0.2, 0.3, 0.7], [0.48, 0.28, 0.72], [0.12, 0.44, 0.68],
  [-0.15, 0.58, 0.66], [0.5, 0.55, 0.7], [0.15, 0.7, 0.62], [-0.2, 0.83, 0.75], [0.45, 0.82, 0.72],
];

export interface TopicMapPageProps {
  topic: TopicMap;
  width: number;
  height: number; // viewport height of the page (0 until measured)
  unlocked: boolean;
  progress: GradeProgress | undefined;
  friends: PublicProfile[];
  onNodePress: (subtopicId: string) => void;
  onLockPress: () => void;
}

/** The student's own cat, in its colour and hat, bobbing gently on the water. */
function PlayerCat() {
  const colorId = useCosmetics((c) => c.colorId);
  const hatId = useCosmetics((c) => c.hatId);
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: -6, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [bob]);
  const size = 78;
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: (LABEL_W - size) / 2, top: -size * 0.66, transform: [{ translateY: bob }] }}>
      <CatAvatar source={catPoses.cute} colorId={colorId} hatId={hatId} size={size} label="You are here" />
    </Animated.View>
  );
}

/** A 3D cloud that drifts slowly side to side. */
function DriftingCloud({ left, top, width, delay }: { left: number; top: `${number}%`; width: number; delay: number }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(x, { toValue: 14, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(x, { toValue: -14, duration: 3200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(x, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [x, delay]);
  return (
    <Animated.Image source={uiAssets.overlays.cloud} resizeMode="contain"
      style={{ position: "absolute", left, top, width, height: width * 0.65, transform: [{ translateX: x }] }} />
  );
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

export function TopicMapPage({ topic, width, height: pageHeight, unlocked, progress, friends, onNodePress, onLockPress }: TopicMapPageProps) {
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

  // Maps are walked bottom → top, so open at the bottom (the first subtopic). On web the first scroll can land before
  // layout, so also retry once after the page has its measured height.
  const toStart = () => ref.current?.scrollToEnd({ animated: false });
  useEffect(() => {
    const t = setTimeout(toStart, 60);
    return () => clearTimeout(t);
  }, [height, pageHeight]);

  return (
    <View style={[pageHeight ? { width, height: pageHeight } : { width, flex: 1 }, { overflow: "hidden" }]}>
      <View style={{ flex: 1, backgroundColor: theme.ground }}>
        <ScrollView ref={ref} contentContainerStyle={{ height: height + 40 }} onLayout={toStart} onContentSizeChange={toStart} showsVerticalScrollIndicator={false}>
          <Image source={theme.bg} style={{ position: "absolute", top: 0, left: 0, width, height }} resizeMode="cover" accessibilityIgnoresInvertColors />
          {subs.map((s, i) => {
            const done = ([1, 2, 3] as const).filter((l) => isLevelComplete(progress, s.id, l));
            const gold = done.length === 3;
            const src = !unlocked ? uiAssets.node.locked : gold ? uiAssets.node.gold : i === currentIdx ? uiAssets.node.current : uiAssets.node.default;
            return (
              <View key={s.id} style={[styles.nodeWrap, { left: Math.min(width - LABEL_W, Math.max(0, pos[i].x - LABEL_W / 2)), top: pos[i].y }]}>
                <Pressable
                  onPress={() => onNodePress(s.id)}
                  disabled={!unlocked}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.name}. ${done.length} of 3 levels complete`}
                  hitSlop={8}
                  style={{ alignItems: "center" }}
                >
                  <Image source={src} style={{ width: NODE, height: NODE }} />
                  <View style={styles.stars}>
                    {([1, 2, 3] as const).map((l) => (
                      <Image key={l} source={uiAssets.icons.star} style={[styles.star, !isLevelComplete(progress, s.id, l) && styles.starEmpty]} />
                    ))}
                  </View>
                  <Text style={styles.nodeName} numberOfLines={2}>{s.name}</Text>
                </Pressable>
                {unlocked && i === currentIdx ? <PlayerCat /> : null}
              </View>
            );
          })}
          {unlocked
            ? (() => {
                const perNode = new Map<number, number>();
                return friends.slice(0, 8).map((f) => {
                  // TODO(backend): friends' real map position is not in the API yet; pin them to a stable node by uid hash.
                  const i = hash(f.uid) % Math.max(1, n);
                  const k = perNode.get(i) ?? 0;
                  perNode.set(i, k + 1);
                  // Stand beside the button on the open-water side (away from the island); a second friend takes the other side.
                  const openRight = theme.island === "left";
                  const right = k % 2 === 0 ? openRight : !openRight;
                  const fits = right ? pos[i].x + NODE / 2 + 64 <= width : pos[i].x - NODE / 2 - 64 >= 0;
                  const side = fits ? right : !right;
                  const x = side ? pos[i].x + NODE / 2 : pos[i].x - NODE / 2 - 64;
                  return (
                    <View key={f.uid} style={[styles.friend, { left: Math.min(width - 64, Math.max(0, x)), top: pos[i].y - 4 + Math.floor(k / 2) * 30 }]} pointerEvents="none">
                      <CatAvatar source={catPoses.cute} colorId={f.cat.colorId} hatId={f.cat.hatId} size={46} />
                      <Text style={styles.friendName} numberOfLines={1}>{f.displayName.replace(/\s*\(sample\)$/, "")}</Text>
                    </View>
                  );
                });
              })()
            : null}
        </ScrollView>

        {!unlocked ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onLockPress} accessibilityRole="button" accessibilityLabel={`${topic.name} is locked. Tap to find the key.`}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(235,246,255,0.55)" }]} />
            {CLOUDS.map(([l, t, w], i) => <DriftingCloud key={i} left={l * width} top={`${t * 100}%`} width={w * width} delay={i * 300} />)}
            <View style={styles.lockWrap}>
              <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                <Image source={catPoses.scared} style={{ width: 84, height: 78, marginRight: -10 }} resizeMode="contain" />
                <Image source={uiAssets.overlays.lock} style={{ width: 96, height: 96 }} />
              </View>
              <View style={styles.keyBadge}><Text style={styles.keyText}>Tap to find the key</Text></View>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nodeWrap: { position: "absolute", width: LABEL_W, alignItems: "center" },
  stars: { flexDirection: "row", gap: 2, marginTop: -6, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 10, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 2, borderColor: colors.border },
  star: { width: 16, height: 16 },
  starEmpty: { tintColor: "#c3c8d6" },
  nodeName: { marginTop: 3, fontSize: 11, lineHeight: 13, fontFamily: fonts.display, color: colors.ink, textAlign: "center", backgroundColor: "rgba(255,255,255,0.88)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: "hidden", maxWidth: LABEL_W },
  friend: { position: "absolute", width: 64, alignItems: "center" },
  friendName: { fontSize: 11, fontFamily: fonts.display, color: colors.ink, backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 4, borderRadius: 6, overflow: "hidden", maxWidth: 70 },
  lockWrap: { position: "absolute", bottom: 40, left: 0, right: 0, alignItems: "center" },
  keyBadge: { backgroundColor: colors.accent, borderRadius: 20, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 16, minHeight: 44, justifyContent: "center", marginTop: 4 },
  keyText: { fontFamily: fonts.display, color: colors.ink, fontSize: 16 },
});
