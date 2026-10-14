// Working space: white paper with a faint grid, finger / stylus drawing with SVG paths, pens, eraser, undo, clear.
import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { eraseAt, pushPoint, strokePath, type Pt, type Stroke } from "../logic/strokes";
import { colors, fonts, MIN_TOUCH, radius, space } from "../theme/colors";

const INKS = [{ name: "Dark ink", c: colors.ink }, { name: "Blue", c: colors.primary }, { name: "Red", c: colors.bad }];
const WIDTHS = [{ name: "Thin", w: 2.5 }, { name: "Thick", w: 6 }];
const ERASER_R = 14;
const GRID = 28;
const GRID_COLOR = "#e3e8f2";
const IS_WEB = Platform.OS === "web";
// Palm rejection: while a stylus (pen pointer) is in use, finger touches don't draw. Module-level so it survives remounts.
let penAt = 0; // last Pencil/stylus activity: touches within PALM_MS of it are a resting palm, not drawing
const PALM_MS = 5000;

type Tool = "pen" | "eraser";

function Tip({ label, active, onPress, children, disabled }: { label: string; active?: boolean; onPress: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active, disabled: !!disabled }}
      style={({ pressed }) => [styles.tool, active && styles.toolOn, disabled && { opacity: 0.4 }, pressed && { transform: [{ scale: 0.95 }] }]}>
      {children}
    </Pressable>
  );
}

// --- Layers: grid and committed strokes are memoized; only the live stroke changes while drawing. ---

const Grid = memo(function Grid({ w, h }: { w: number; h: number }) {
  const cols = Math.ceil(w / GRID), rows = Math.ceil(h / GRID);
  return (
    <>
      {Array.from({ length: cols }, (_, i) => <Line key={`v${i}`} x1={i * GRID} y1={0} x2={i * GRID} y2={h} stroke={GRID_COLOR} strokeWidth={1} />)}
      {Array.from({ length: rows }, (_, i) => <Line key={`h${i}`} x1={0} y1={i * GRID} x2={w} y2={i * GRID} stroke={GRID_COLOR} strokeWidth={1} />)}
    </>
  );
});

const Committed = memo(function Committed({ strokes }: { strokes: Stroke[] }) {
  return <>{strokes.map((s) => <Path key={s.id} d={strokePath(s.points)} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}</>;
});

// Native live stroke: owns its own state so the rest of the pad does not re-render per point.
interface LiveHandle { start: (s: Stroke) => void; add: (p: Pt) => void; end: () => void }
const LiveLayer = forwardRef<LiveHandle>(function LiveLayer(_, ref) {
  const stroke = useRef<Stroke | null>(null);
  const [, bump] = useState(0);
  useImperativeHandle(ref, () => ({
    start: (s) => { stroke.current = s; bump((n) => n + 1); },
    add: (p) => { if (stroke.current && pushPoint(stroke.current.points, p)) bump((n) => n + 1); },
    end: () => { stroke.current = null; bump((n) => n + 1); },
  }), []);
  const s = stroke.current;
  return s ? <Path d={strokePath(s.points)} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : null;
});

// Web committed strokes: plain SVG paths (memoized on the strokes array).
const h = React.createElement;
const WebCommitted = memo(function WebCommitted({ strokes }: { strokes: Stroke[] }) {
  return h(React.Fragment, null, strokes.map((s) => h("path", { key: s.id, d: strokePath(s.points), stroke: s.color, strokeWidth: s.width, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" })));
});

export function Scratchpad() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState(INKS[0].c);
  const [width, setWidth] = useState(WIDTHS[0].w);
  const [tool, setTool] = useState<Tool>("pen");
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Refs so the gesture handlers (created once) always see current settings.
  const cfg = useRef({ color, width, tool });
  cfg.current = { color, width, tool };
  const strokesRef = useRef<Stroke[]>([]);
  const nextId = useRef(1);
  const commit = (s: Stroke[]) => { if (s === strokesRef.current) return; strokesRef.current = s; setStrokes(s); };
  const newStroke = (p: Pt): Stroke => ({ id: nextId.current++, color: cfg.current.color, width: cfg.current.width, points: [p] });

  // ---- Native: PanResponder; only LiveLayer re-renders per point. ----
  const liveRef = useRef<LiveHandle>(null);
  const nativeLive = useRef<Stroke | null>(null);
  const nativeFinish = () => {
    const l = nativeLive.current;
    nativeLive.current = null;
    liveRef.current?.end();
    setDrawing(false);
    if (l) commit([...strokesRef.current, l]);
  };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false, // keep the gesture so the page never scrolls while drawing
    onPanResponderGrant: (e) => {
      const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      setDrawing(true);
      if (cfg.current.tool === "eraser") { commit(eraseAt(strokesRef.current, p, ERASER_R)); return; }
      nativeLive.current = newStroke(p);
      liveRef.current?.start(nativeLive.current);
    },
    onPanResponderMove: (e) => {
      const p = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
      if (cfg.current.tool === "eraser") { commit(eraseAt(strokesRef.current, p, ERASER_R)); return; }
      liveRef.current?.add(p);
    },
    onPanResponderRelease: () => nativeFinish(),
    onPanResponderTerminate: () => nativeFinish(),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // ---- Web: Pointer Events on the paper node; the live path's `d` is set directly (no React render per point). ----
  const paperRef = useRef<View>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const liveEl = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (!IS_WEB) return;
    const paper = paperRef.current as unknown as HTMLElement | null;
    const svg = svgRef.current;
    const path = liveEl.current;
    if (!paper || !svg || !path) return;
    let active: number | null = null; // pointerId of the stroke in progress
    let activeType = "";
    let live: Stroke | null = null;
    let raf = 0;
    const draw = () => { raf = 0; if (live) path.setAttribute("d", strokePath(live.points)); };
    const clearLive = () => { if (raf) cancelAnimationFrame(raf); raf = 0; path.setAttribute("d", ""); };
    const at = (e: PointerEvent): Pt => { const r = svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const erase = (p: Pt) => commit(eraseAt(strokesRef.current, p, ERASER_R));
    const samples = (e: PointerEvent): PointerEvent[] => {
      const c = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
      return c.length ? c : [e];
    };
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== active) return;
      try { paper.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
      active = null;
      setDrawing(false);
      if (live) {
        const l = live;
        live = null;
        commit([...strokesRef.current, l]); // live path is cleared in the layout effect below, after React paints the stroke
      }
      void cancelled;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "pen") penAt = Date.now();
      if (e.pointerType === "touch" && Date.now() - penAt < PALM_MS) return; // palm rejection
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (active !== null) {
        // A pen takes over from a touch stroke (palm landed first); otherwise ignore extra pointers.
        if (!(e.pointerType === "pen" && activeType === "touch")) return;
        live = null; clearLive();
      }
      e.preventDefault();
      active = e.pointerId; activeType = e.pointerType;
      try { paper.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
      const p = at(e);
      setDrawing(true);
      if (cfg.current.tool === "eraser") { erase(p); return; }
      live = newStroke(p);
      path.setAttribute("stroke", live.color);
      path.setAttribute("stroke-width", String(live.width));
      draw();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType === "pen") penAt = Date.now();
      if (e.pointerId !== active) return;
      e.preventDefault();
      for (const c of samples(e)) {
        const p = at(c);
        if (cfg.current.tool === "eraser") erase(p);
        else if (live && pushPoint(live.points, p) && !raf) raf = requestAnimationFrame(draw);
      }
    };
    const up = (e: PointerEvent) => end(e, false);
    const cancel = (e: PointerEvent) => end(e, true);
    const hover = (e: PointerEvent) => { if (e.pointerType === "pen") penAt = Date.now(); };
    const stop = (e: Event) => e.preventDefault();
    paper.addEventListener("pointerdown", down);
    paper.addEventListener("pointermove", move);
    paper.addEventListener("pointerup", up);
    paper.addEventListener("pointercancel", cancel);
    paper.addEventListener("pointerover", hover);
    // Keep iPad Safari (Scribble, magnifier, text selection, scrolling) from stealing the stroke.
    paper.addEventListener("touchstart", stop, { passive: false });
    paper.addEventListener("touchmove", stop, { passive: false });
    paper.addEventListener("selectstart", stop);
    paper.addEventListener("contextmenu", stop);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      paper.removeEventListener("pointerdown", down);
      paper.removeEventListener("pointermove", move);
      paper.removeEventListener("pointerup", up);
      paper.removeEventListener("pointercancel", cancel);
      paper.removeEventListener("pointerover", hover);
      paper.removeEventListener("touchstart", stop);
      paper.removeEventListener("touchmove", stop);
      paper.removeEventListener("selectstart", stop);
      paper.removeEventListener("contextmenu", stop);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // After a stroke is committed (or undo/clear/erase), drop the imperative live path.
  useLayoutEffect(() => { if (IS_WEB && liveEl.current) liveEl.current.setAttribute("d", ""); }, [strokes]);

  const undo = useCallback(() => commit(strokesRef.current.slice(0, -1)), []);
  const clear = useCallback(() => commit([]), []);
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const webStyle = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", pointerEvents: "none" } as React.CSSProperties;

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
      {IS_WEB ? (
        <View ref={paperRef} style={styles.paper} onLayout={onLayout}>
          {h("svg", { ref: svgRef, style: webStyle, width: "100%", height: "100%" },
            h("defs", null, h("pattern", { id: "pad-grid", width: GRID, height: GRID, patternUnits: "userSpaceOnUse" },
              h("path", { d: `M0 0V${GRID}M0 0H${GRID}`, stroke: GRID_COLOR, strokeWidth: 1, fill: "none" }))),
            h("rect", { width: "100%", height: "100%", fill: "url(#pad-grid)" }),
            h(WebCommitted, { strokes }),
            h("path", { ref: liveEl, fill: "none", strokeLinecap: "round", strokeLinejoin: "round", style: { pointerEvents: "none" } }))}
          {strokes.length === 0 && !drawing ? <Text style={styles.empty} pointerEvents="none">Write or draw here</Text> : null}
        </View>
      ) : (
        <View style={styles.paper} onLayout={onLayout} {...responder.panHandlers}>
          <Svg width="100%" height="100%" pointerEvents="none">
            <Grid w={size.w} h={size.h} />
            <Committed strokes={strokes} />
            <LiveLayer ref={liveRef} />
          </Svg>
          {strokes.length === 0 && !drawing ? <Text style={styles.empty} pointerEvents="none">Write or draw here</Text> : null}
        </View>
      )}
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
  paper: { flex: 1, backgroundColor: "#fff", borderRadius: radius.m, borderWidth: 3, borderColor: colors.border, overflow: "hidden", ...({ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", cursor: "crosshair" } as object) },
  empty: { position: "absolute", top: "45%", alignSelf: "center", color: colors.muted, fontWeight: "800", fontSize: 18 },
});
