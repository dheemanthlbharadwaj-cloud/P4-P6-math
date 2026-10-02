// Working space: white paper with a faint grid, finger / stylus drawing with SVG paths, pens, eraser, undo, clear.
import React, { useCallback, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { eraseAt, strokePath, type Pt, type Stroke } from "../logic/strokes";
import { colors, fonts, MIN_TOUCH, radius, space } from "../theme/colors";

const INKS = [{ name: "Dark ink", c: colors.ink }, { name: "Blue", c: colors.primary }, { name: "Red", c: colors.bad }];
const WIDTHS = [{ name: "Thin", w: 2.5 }, { name: "Thick", w: 6 }];
const ERASER_R = 14;
const GRID = 28;

type Tool = "pen" | "eraser";

function Tip({ label, active, onPress, children, disabled }: { label: string; active?: boolean; onPress: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active, disabled: !!disabled }}
      style={({ pressed }) => [styles.tool, active && styles.toolOn, disabled && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.95 }] }]}>
      {children}
    </Pressable>
  );
}

export function Scratchpad() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [live, setLive] = useState<Stroke | null>(null);
  const [color, setColor] = useState(INKS[0].c);
  const [width, setWidth] = useState(WIDTHS[0].w);
  const [tool, setTool] = useState<Tool>("pen");
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Refs so the PanResponder (created once) always sees current settings.
  const cfg = useRef({ color, width, tool });
  cfg.current = { color, width, tool };
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<Stroke | null>(null);
  const nextId = useRef(1);
  const commit = (s: Stroke[]) => { strokesRef.current = s; setStrokes(s); };

  const pt = (e: { nativeEvent: { locationX: number; locationY: number } }): Pt => ({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false, // keep the gesture so the page never scrolls while drawing
    onPanResponderGrant: (e) => {
      const p = pt(e);
      if (cfg.current.tool === "eraser") { commit(eraseAt(strokesRef.current, p, ERASER_R)); return; }
      liveRef.current = { id: nextId.current++, color: cfg.current.color, width: cfg.current.width, points: [p] };
      setLive(liveRef.current);
    },
    onPanResponderMove: (e) => {
      const p = pt(e);
      if (cfg.current.tool === "eraser") { commit(eraseAt(strokesRef.current, p, ERASER_R)); return; }
      const l = liveRef.current;
      if (!l) return;
      const last = l.points[l.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
      liveRef.current = { ...l, points: [...l.points, p] };
      setLive(liveRef.current);
    },
    onPanResponderRelease: () => finish(),
    onPanResponderTerminate: () => finish(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  function finish() {
    const l = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (l) commit([...strokesRef.current, l]);
  }

  const undo = useCallback(() => commit(strokesRef.current.slice(0, -1)), []);
  const clear = useCallback(() => commit([]), []);
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const cols = Math.ceil(size.w / GRID), rows = Math.ceil(size.h / GRID);
  const all = live ? [...strokes, live] : strokes;

  return (
    <View style={styles.wrap} accessibilityLabel="Working space">
      <View style={styles.toolbar}>
        {INKS.map((i) => (
          <Tip key={i.c} label={`${i.name} pen`} active={tool === "pen" && color === i.c} onPress={() => { setTool("pen"); setColor(i.c); }}>
            <View style={[styles.swatch, { backgroundColor: i.c }]} />
          </Tip>
        ))}
        {WIDTHS.map((w) => (
          <Tip key={w.name} label={`${w.name} line`} active={width === w.w} onPress={() => { setWidth(w.w); setTool("pen"); }}>
            <View style={{ width: 22, height: w.w, borderRadius: w.w, backgroundColor: colors.ink }} />
          </Tip>
        ))}
        <Tip label="Eraser" active={tool === "eraser"} onPress={() => setTool("eraser")}><Text style={styles.toolText}>Erase</Text></Tip>
        <Tip label="Undo last stroke" onPress={undo} disabled={strokes.length === 0}><Text style={styles.toolText}>Undo</Text></Tip>
        <Tip label="Clear everything" onPress={clear} disabled={strokes.length === 0}><Text style={styles.toolText}>Clear</Text></Tip>
      </View>
      <View style={styles.paper} onLayout={onLayout} {...responder.panHandlers}>
        <Svg width="100%" height="100%" pointerEvents="none">
          {Array.from({ length: cols }, (_, i) => <Line key={`v${i}`} x1={i * GRID} y1={0} x2={i * GRID} y2={size.h} stroke="#e3e8f2" strokeWidth={1} />)}
          {Array.from({ length: rows }, (_, i) => <Line key={`h${i}`} x1={0} y1={i * GRID} x2={size.w} y2={i * GRID} stroke="#e3e8f2" strokeWidth={1} />)}
          {all.map((s) => <Path key={s.id} d={strokePath(s.points)} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
        </Svg>
        {all.length === 0 ? <Text style={styles.empty} pointerEvents="none">Write or draw here</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: space.s },
  tool: { minWidth: MIN_TOUCH - 4, minHeight: 44, paddingHorizontal: 8, borderRadius: radius.m, borderWidth: 3, borderColor: colors.border, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  toolOn: { backgroundColor: colors.highlight, borderColor: colors.primary },
  toolText: { fontFamily: fonts.display, fontSize: 14, color: colors.ink },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border },
  paper: { flex: 1, backgroundColor: "#fff", borderRadius: radius.m, borderWidth: 3, borderColor: colors.border, overflow: "hidden", ...({ touchAction: "none", userSelect: "none", cursor: "crosshair" } as object) },
  empty: { position: "absolute", top: "45%", alignSelf: "center", color: colors.muted, fontWeight: "800", fontSize: 18 },
});
