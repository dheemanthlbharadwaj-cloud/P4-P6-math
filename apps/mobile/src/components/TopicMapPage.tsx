// One topic = one map page. One numbered button per level of every subtopic winds up the river: all Level 1 buttons
// at the bottom (blue), then Level 2 (green), then Level 3 at the top (lemon yellow). A finished level shows a star.
// The subtopic name sits beside each button; friends' mini cats stand next to buttons.
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { GradeProgress, LevelNo, PublicProfile, TopicMap } from "@p6/shared";
import { CatAvatar } from "./CatAvatar";
import { mapThemeFor, uiAssets } from "../theme/assets";
import { catPoses } from "../theme/cats";
import { useCosmetics } from "../store/cosmetics";
import { isLevelComplete, isLevelUnlocked } from "../logic/unlock";
import { CAT, nodeRect, pickRect, placeCat, type Rect } from "../logic/mapLayout";
import { colors, fonts } from "../theme/colors";

const NODE = 48; // fits the narrowest measured water spot on every map (see scripts/map-scenes.py)
const LABEL_MAX = 150; // widest subtopic name label beside a button
const LEVELS: LevelNo[] = [1, 2, 3];
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
  /** A level button was tapped (`locked` = its previous level isn't finished yet). */
  onNodePress: (subtopicId: string, level: LevelNo, locked: boolean) => void;
  onLockPress: () => void;
}

/** The student's own cat, in its colour and hat, bobbing gently on the water beside its button. */
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
  return (
    <Animated.View pointerEvents="none" style={{ transform: [{ translateY: bob }] }}>
      <CatAvatar source={catPoses.cute} colorId={colorId} hatId={hatId} size={CAT.size} label="You are here" />
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
  // Bottom → top: every subtopic's Level 1, then every Level 2, then every Level 3.
  const subIds = useMemo(() => subs.map((s) => s.id), [subs]);
  const nodes = useMemo(() => LEVELS.flatMap((level) => subs.map((s) => ({ s, level }))), [subs]);
  const n = nodes.length;
  const theme = mapThemeFor(topic.order);
  const height = width * theme.aspect;
  // Nodes sit on spots measured from the art: open water, clear of buildings and objects. Other node counts
  // (P4/P5 later) fall back to even spacing along the same water route.
  const route = useMemo(() => buildRoute(theme.route.path, width, height), [theme, width, height]);
  // Measured spots (even rows, wider gaps between the level groups); other node counts fall back to the route.
  const spots = theme.route.spots;
  const pos = spots && spots.length === n
    ? spots.map(([x, y]) => ({ x: x * width, y: y * height - NODE / 2 }))
    : evenSpots(n).map((t) => { const p = route.at(t); return { x: p.x, y: p.y - NODE / 2 }; });
  const state = nodes.map(({ s, level }) => ({
    done: isLevelComplete(progress, s.id, level),
    open: isLevelUnlocked(progress, subIds, level),
  }));
  // The student's cat stands on the furthest level they have completed (the first button before any is done).
  const lastDone = state.reduce((acc, x, i) => (x.done ? i : acc), -1);
  const currentIdx = n ? Math.max(0, lastDone) : -1;

  // Trail dots between consecutive buttons.
  const dots: { x: number; y: number; k: string }[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p = pos[i], q = pos[i + 1];
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    const steps = Math.max(2, Math.round(d / 22));
    for (let k = 1; k < steps; k++) {
      const x = p.x + ((q.x - p.x) * k) / steps, y = p.y + ((q.y - p.y) * k) / steps;
      if (Math.hypot(x - p.x, y - p.y) > NODE * 0.7 && Math.hypot(x - q.x, y - q.y) > NODE * 0.7) dots.push({ x, y, k: `${i}-${k}` });
    }
  }

  // Name labels: try right, left, above, below each button; take the first spot that stays on screen and overlaps no
  // other label or button (else the least-overlapping one). Friends' cats are placed the same way afterwards.
  const placed = useMemo(() => {
    const rects: Rect[] = pos.map((p) => nodeRect(p, NODE));
    // The student's cat stands beside its button, never over any button; names keep out from under it.
    const cat = unlocked && currentIdx >= 0 ? placeCat(pos, currentIdx, NODE, width) : null;
    if (cat) rects.push(cat.covers);
    const labels = nodes.map(({ s }, i) => {
      const est = s.name.length * 6.2 + 14;
      const w = Math.min(LABEL_MAX, est), h = est > LABEL_MAX ? 32 : 19;
      const p = pos[i], cy = p.y + NODE / 2;
      const cands: Rect[] = [
        { x: p.x + NODE / 2 + 4, y: cy - h / 2, w, h },
        { x: p.x - NODE / 2 - 4 - w, y: cy - h / 2, w, h },
        { x: p.x - w / 2, y: p.y - h - 2, w, h },
        { x: p.x - w / 2, y: p.y + NODE + 2, w, h },
      ].map((r) => ({ ...r, x: Math.min(width - r.w - 2, Math.max(2, r.x)) }));
      const best = pickRect(cands, rects);
      rects.push(best);
      return best;
    });
    return { labels, rects, cat };
  }, [pos.map((p) => `${p.x},${p.y}`).join(";"), nodes, width, unlocked, currentIdx]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {dots.map((d) => (
            <View key={d.k} style={[styles.dot, { left: d.x - 5, top: d.y + NODE / 2 - 5 }]} />
          ))}
          {nodes.map(({ s, level }, i) => {
            const { done, open } = state[i];
            // Unfinished levels always show their level colour (blue / green / yellow); a finished level is the gold button.
            const src = done ? uiAssets.node.gold : level === 1 ? uiAssets.node.default : level === 2 ? uiAssets.node.l2 : uiAssets.node.l3;
            const lr = placed.labels[i];
            return (
              <View key={`${s.id}#${level}`} style={[styles.nodeWrap, { left: pos[i].x - NODE / 2, top: pos[i].y }]}>
                <Pressable
                  onPress={() => onNodePress(s.id, level, !open)}
                  disabled={!unlocked}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}. ${s.name}, level ${level}${done ? ", complete" : open ? "" : ", locked"}`}
                  hitSlop={6}
                  style={({ pressed }) => ({ width: NODE, height: NODE, alignItems: "center", justifyContent: "center", transform: [{ scale: pressed ? 0.92 : 1 }] })}
                >
                  <Image source={src} style={{ position: "absolute", width: NODE, height: NODE }} />
                  <Text style={styles.num}>{i + 1}</Text>
                </Pressable>
                <View pointerEvents="none" style={[styles.labelBox, { left: lr.x - (pos[i].x - NODE / 2), top: lr.y - pos[i].y, width: lr.w }]}>
                  <Text style={styles.nodeName} numberOfLines={2}>{s.name}</Text>
                </View>
              </View>
            );
          })}
          {/* The student's cat beside its current button, drawn after every label so no name covers it. */}
          {placed.cat ? (
            <View pointerEvents="none" style={{ position: "absolute", left: placed.cat.x, top: placed.cat.y }}><PlayerCat /></View>
          ) : null}
          {unlocked
            ? (() => {
                const perNode = new Map<number, number>();
                const taken = [...placed.rects];
                return friends.slice(0, 8).map((f) => {
                  // TODO(backend): friends' real map position is not in the API yet; pin them to a stable node by uid hash.
                  const i = hash(f.uid) % Math.max(1, n);
                  const k = perNode.get(i) ?? 0;
                  perNode.set(i, k + 1);
                  // Next to the button wherever no name or other button is in the way.
                  const p = pos[i];
                  const cands: Rect[] = [
                    { x: p.x + NODE / 2 + 2, y: p.y - 6, w: 64, h: 66 },
                    { x: p.x - NODE / 2 - 66, y: p.y - 6, w: 64, h: 66 },
                    { x: p.x - 32, y: p.y - 68, w: 64, h: 66 },
                    { x: p.x + NODE / 2 + 2, y: p.y - 66, w: 64, h: 66 },
                    { x: p.x - NODE / 2 - 66, y: p.y - 66, w: 64, h: 66 },
                  ].map((r) => ({ ...r, x: Math.min(width - r.w, Math.max(0, r.x)) }));
                  const r = pickRect(cands, taken);
                  taken.push(r);
                  void k;
                  const x = r.x, y = r.y;
                  return (
                    <View key={f.uid} style={[styles.friend, { left: Math.min(width - 64, Math.max(0, x)), top: y }]} pointerEvents="none">
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
  nodeWrap: { position: "absolute", width: NODE, height: NODE },
  num: { fontFamily: fonts.display, fontSize: 18, color: "#fff", marginTop: -4, textShadowColor: "rgba(51,38,42,0.85)", textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 2 },
  dot: { position: "absolute", width: 10, height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 2, borderColor: "rgba(61,43,43,0.6)" },
  labelBox: { position: "absolute", alignItems: "center" },
  nodeName: { textAlign: "center", fontSize: 11, lineHeight: 13, fontFamily: fonts.display, color: colors.ink, backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: "hidden" },
  friend: { position: "absolute", width: 64, alignItems: "center" },
  friendName: { fontSize: 11, fontFamily: fonts.display, color: colors.ink, backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 4, borderRadius: 6, overflow: "hidden", maxWidth: 70 },
  lockWrap: { position: "absolute", bottom: 40, left: 0, right: 0, alignItems: "center" },
  keyBadge: { backgroundColor: colors.accent, borderRadius: 20, borderWidth: 3, borderColor: colors.border, paddingHorizontal: 16, minHeight: 44, justifyContent: "center", marginTop: 4 },
  keyText: { fontFamily: fonts.display, color: colors.ink, fontSize: 16 },
});
