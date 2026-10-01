// Generates the placeholder UI art in assets/ui/. Re-run: node scripts/gen-placeholders.mjs
// The product owner replaces these files (same names) with real art; nothing else needs to change.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.resolve(import.meta.dirname, "../assets/ui");
fs.mkdirSync(OUT, { recursive: true });

function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// shape = (x,y in 0..1) => boolean ; supersampled for anti-aliasing
const inCircle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inRect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const inRRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r;
};
const inPoly = (pts) => (x, y) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inHeart = (x, y) => {
  const X = (x - 0.5) * 2.6, Y = (0.55 - y) * 2.6;
  return (X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 <= 0;
};
const star = (cx, cy, R, r) => inPoly(Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r : R;
  return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
}));
const union = (...fs) => (x, y) => fs.some((f) => f(x, y));
const minus = (a, b) => (x, y) => a(x, y) && !b(x, y);

function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

/** layers: [{shape, color, alpha?}] painted in order on a transparent canvas */
function draw(name, w, h, layers, bg) {
  const buf = Buffer.alloc(w * h * 4);
  const S = 3;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    if (bg) { const c = bg(px / w, py / h); [r, g, b] = c; a = 255; }
    for (const L of layers) {
      let hit = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        if (L.shape((px + (sx + 0.5) / S) / w, (py + (sy + 0.5) / S) / h)) hit++;
      }
      const cov = (hit / (S * S)) * (L.alpha ?? 1);
      if (cov > 0) {
        const [lr, lg, lb] = hex(L.color);
        const na = cov + (a / 255) * (1 - cov);
        r = (lr * cov + r * (a / 255) * (1 - cov)) / na; g = (lg * cov + g * (a / 255) * (1 - cov)) / na; b = (lb * cov + b * (a / 255) * (1 - cov)) / na;
        a = na * 255;
      }
    }
    const i = (py * w + px) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  }
  fs.writeFileSync(path.join(OUT, name), png(w, h, buf));
}

const ring = (c, r1, r2) => minus(inCircle(...c, r1), inCircle(...c, r2));
const DARK = "#2b2d42";

// ---- node buttons (256x256) ----
const node = (fill, extra = []) => [
  { shape: inCircle(0.5, 0.56, 0.44), color: "#00000033" },
  { shape: inCircle(0.5, 0.5, 0.44), color: DARK },
  { shape: inCircle(0.5, 0.5, 0.38), color: fill },
  { shape: inCircle(0.42, 0.4, 0.12), color: "#ffffff", alpha: 0.35 },
  ...extra,
];
draw("node-default.png", 256, 256, node("#4cc9f0"));
draw("node-current.png", 256, 256, node("#ffb703", [{ shape: star(0.5, 0.5, 0.2, 0.09), color: "#ffffff" }]));
draw("node-gold.png", 256, 256, node("#ffd166", [{ shape: star(0.5, 0.5, 0.2, 0.09), color: "#fb8500" }]));
draw("node-locked.png", 256, 256, node("#adb5bd"));
// ---- level buttons (192x192): 1/2/3 as dots ----
for (const [n, fill] of [["1", "#8ecae6"], ["2", "#4cc9f0"], ["3", "#4895ef"], ["gold", "#ffd166"]]) {
  const dots = n === "gold" ? [0.5] : Array.from({ length: Number(n) }, (_, i) => 0.5 + (i - (Number(n) - 1) / 2) * 0.2);
  draw(`level-${n}.png`, 192, 192, [
    { shape: inRRect(0.04, 0.08, 0.96, 0.96, 0.22), color: "#00000033" },
    { shape: inRRect(0.04, 0.04, 0.96, 0.92, 0.22), color: DARK },
    { shape: inRRect(0.1, 0.1, 0.9, 0.86, 0.17), color: fill },
    ...dots.map((x) => ({ shape: n === "gold" ? star(0.5, 0.48, 0.26, 0.12) : star(x, 0.48, 0.1, 0.045), color: n === "gold" ? "#fb8500" : "#ffffff" })),
  ]);
}
// ---- toolbar icons (128x128, drawn dark; tinted by active state in code via opacity) ----
const icon = (shapes, color = DARK) => shapes.map((s) => ({ shape: s, color }));
draw("tab-map.png", 128, 128, icon([union(inCircle(0.5, 0.4, 0.26), inPoly([[0.27, 0.5], [0.73, 0.5], [0.5, 0.9]])), ]).concat([{ shape: inCircle(0.5, 0.4, 0.1), color: "#ffffff" }]));
draw("tab-book.png", 128, 128, icon([inRRect(0.12, 0.2, 0.48, 0.8, 0.04), inRRect(0.52, 0.2, 0.88, 0.8, 0.04)]));
draw("tab-cat.png", 128, 128, icon([inCircle(0.5, 0.58, 0.32), inPoly([[0.2, 0.45], [0.2, 0.12], [0.42, 0.3]]), inPoly([[0.8, 0.45], [0.8, 0.12], [0.58, 0.3]])]).concat([{ shape: union(inCircle(0.4, 0.55, 0.05), inCircle(0.6, 0.55, 0.05)), color: "#ffffff" }]));
draw("tab-trophy.png", 128, 128, icon([inPoly([[0.25, 0.12], [0.75, 0.12], [0.68, 0.5], [0.5, 0.62], [0.32, 0.5]]), inRect(0.45, 0.6, 0.55, 0.78), inRRect(0.3, 0.78, 0.7, 0.9, 0.03), ring([0.2, 0.28], 0.1, 0.05), ring([0.8, 0.28], 0.1, 0.05)]));
draw("tab-person.png", 128, 128, icon([inCircle(0.5, 0.32, 0.18), minus(inCircle(0.5, 0.95, 0.38), inRect(0, 0.95, 1, 1))]));
// ---- status icons ----
draw("icon-heart.png", 96, 96, [{ shape: inHeart, color: "#e63946" }, { shape: inCircle(0.35, 0.3, 0.07), color: "#ffffff", alpha: 0.5 }]);
draw("icon-energy.png", 96, 96, [{ shape: inPoly([[0.58, 0.04], [0.2, 0.55], [0.46, 0.55], [0.38, 0.96], [0.8, 0.4], [0.54, 0.4]]), color: "#fcbf49" }]);
draw("icon-star.png", 96, 96, [{ shape: star(0.5, 0.54, 0.46, 0.2), color: "#ffb703" }]);
draw("icon-timer.png", 96, 96, [{ shape: ring([0.5, 0.5], 0.42, 0.34), color: DARK }, { shape: inRect(0.47, 0.22, 0.53, 0.52), color: DARK }, { shape: inRect(0.47, 0.47, 0.7, 0.53), color: DARK }]);
// ---- lock + cloud overlays ----
draw("lock.png", 192, 192, [
  { shape: ring([0.5, 0.36], 0.24, 0.14), color: DARK },
  { shape: inRRect(0.22, 0.4, 0.78, 0.86, 0.08), color: DARK },
  { shape: inRRect(0.27, 0.45, 0.73, 0.81, 0.06), color: "#ffb703" },
  { shape: inCircle(0.5, 0.6, 0.06), color: DARK },
]);
draw("cloud.png", 512, 256, [{ shape: union(inCircle(0.25, 0.6, 0.2), inCircle(0.42, 0.42, 0.26), inCircle(0.62, 0.5, 0.24), inCircle(0.78, 0.62, 0.17), inRRect(0.12, 0.6, 0.9, 0.8, 0.1)), color: "#ffffff" }]);
// ---- hats (256x256 transparent; worn on top of the cat's head) ----
draw("hat-cap.png", 256, 256, [{ shape: union(inPoly([[0.2, 0.7], [0.3, 0.3], [0.7, 0.3], [0.8, 0.7]]), inRRect(0.15, 0.62, 0.95, 0.74, 0.05)), color: "#e63946" }]);
draw("hat-crown.png", 256, 256, [{ shape: inPoly([[0.2, 0.75], [0.15, 0.3], [0.35, 0.5], [0.5, 0.2], [0.65, 0.5], [0.85, 0.3], [0.8, 0.75]]), color: "#ffd166" }]);
draw("hat-wizard.png", 256, 256, [{ shape: union(inPoly([[0.5, 0.0], [0.28, 0.72], [0.72, 0.72]]), inRRect(0.12, 0.68, 0.88, 0.78, 0.05)), color: "#6a4c93" }]);
draw("hat-grad.png", 256, 256, [{ shape: union(inPoly([[0.5, 0.2], [0.95, 0.42], [0.5, 0.64], [0.05, 0.42]]), inRect(0.3, 0.55, 0.7, 0.78)), color: "#2b2d42" }]);
// ---- map backgrounds (360x640) ----
const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const grad = (top, bottom) => (x, y) => lerp(hex(top), hex(bottom), y);
draw("map-bg-1.png", 360, 640, [{ shape: union(inCircle(0.2, 1.05, 0.5), inCircle(0.85, 1.0, 0.55)), color: "#7bc96f" }], grad("#bde0fe", "#e9f5db"));
draw("map-bg-2.png", 360, 640, [{ shape: union(inCircle(0.8, 1.05, 0.5), inCircle(0.1, 1.0, 0.45)), color: "#ffcf9e" }], grad("#cdb4db", "#ffe5ec"));
draw("map-bg-3.png", 360, 640, [{ shape: union(inCircle(0.5, 1.1, 0.6)), color: "#a8dadc" }], grad("#fdf0d5", "#caf0f8"));
console.log("placeholders written to", OUT);
