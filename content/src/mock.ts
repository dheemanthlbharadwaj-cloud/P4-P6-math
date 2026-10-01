// `mock` — realistic fake bundle with the SAME output files/format as `build`, so the app runs before real data exists.
import type { AnswerPart, AnswerSpec, Difficulty, Grade, Paper, Question } from "@p6/shared";
import { assetsContentRoot, slugify } from "./paths";
import { writeOutputs, type FigureSource } from "./output";
import { buildCurriculum, subtopicId, type SelCandidate, type SubtopicDef } from "./select";
import { tokenize } from "./tokenizer";

export const MOCK_SUBTOPICS: Record<string, string[]> = {
  Algebra: ["Simplifying expressions", "Substitution", "Solving simple equations", "Algebra word problems", "Number patterns"],
  "Angles in Geometric Figures": ["Angles on a straight line", "Angles in triangles", "Angles in quadrilaterals", "Angles in parallel lines", "Composite figures"],
  "Area and Perimeter": ["Area of rectangles and squares", "Area of triangles", "Perimeter of composite figures", "Area of composite figures", "Finding missing sides"],
  Arithmetic: ["Whole numbers", "Order of operations", "Decimals", "Estimation and rounding", "Multiples and factors"],
  Circles: ["Circumference", "Area of circles", "Semicircles and quarter circles", "Composite figures with circles"],
  "Data Representation": ["Average", "Reading tables", "Bar graphs", "Line graphs", "Pie charts"],
  Drawing: ["Drawing angles", "Drawing shapes", "Drawing nets", "Symmetry"],
  Fractions: ["Adding and subtracting fractions", "Multiplying fractions", "Division of fractions", "Fraction of a quantity", "Fraction word problems"],
  Percentage: ["Percentage of a quantity", "Discount", "GST and interest", "Percentage change", "Finding the whole"],
  Rate: ["Speed", "Distance and time", "Rate of flow", "Average speed"],
  Ratio: ["Equivalent ratios", "Ratio of quantities", "Ratio word problems", "Changing ratios", "Ratio and fractions"],
  "Solid Figures and Nets": ["Identifying solids", "Faces and edges", "Nets of solids", "Surface area", "Views of solids"],
  "Volume of Solids and Liquids": ["Volume of cuboids", "Volume of cubes", "Liquid in tanks", "Water level problems", "Volume and litres"],
};

// ---- deterministic PRNG ----
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
  return {
    next,
    int: (a: number, b: number) => a + Math.floor(next() * (b - a + 1)),
    pick: <T,>(xs: T[]) => xs[Math.floor(next() * xs.length)],
    shuffle: <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  };
}
type R = ReturnType<typeof rng>;
const hashStr = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const fmt = (n: number) => String(Math.round(n * 1e6) / 1e6);
const lat = (n: number, d: number) => `$\\frac{${n}}{${d}}$`;
const NAMES = ["Mei Ling", "Ahmad", "Priya", "Jun Wei", "Siti", "Daniel", "Hui Min", "Ravi", "Alice", "Kai"];

interface Gen {
  stem: string;
  // single numeric/ratio/fraction/text answer
  answer?: { spec: AnswerSpec; display: string; text: string; wrong: string[] };
  parts?: { label: string; spec: AnswerSpec; display: string }[];
  figure?: "rect" | "angle" | "circle" | "cuboid";
  openOnly?: boolean;
  noMark?: boolean;
}

const numAns = (value: number, unit: string | undefined, wrong: number[], money = false): Gen["answer"] => {
  const text = money ? `＄${value.toFixed(2)}` : `${fmt(value)}${unit ? " " + unit : ""}`;
  return {
    spec: money ? { kind: "number", value, tolerance: 0.005, unit: "$" } : { kind: "number", value, ...(unit ? { unit } : {}) },
    display: text,
    text,
    wrong: wrong.map((w) => (money ? `＄${w.toFixed(2)}` : `${fmt(w)}${unit ? " " + unit : ""}`)),
  };
};

type Maker = (lv: number, r: R) => Gen;

const scale = (lv: number) => (lv === 1 ? 1 : lv === 2 ? 3 : 8);

const arithmetic: Maker[] = [
  (lv, r) => { const a = r.int(20, 90) * scale(lv), b = r.int(11, 60) * scale(lv); return { stem: `What is ${a} + ${b} × 3?`, answer: numAns(a + b * 3, undefined, [(a + b) * 3, a + b + 3, a * b]) }; },
  (lv, r) => { const a = r.int(2, 9) * scale(lv), b = r.int(3, 12); return { stem: `Calculate $${a} \\times ${b} - ${b} \\div 1$.`, answer: numAns(a * b - b, undefined, [a * b + b, a * b, a - b]) }; },
  (lv, r) => { const a = r.int(12, 99) / 10, b = r.int(11, 49) / 10; return { stem: `Find the value of ${a.toFixed(1)} + ${b.toFixed(1)}.`, answer: numAns(Math.round((a + b) * 10) / 10, undefined, [a + b + 1, a + b - 0.1, a * b]) }; },
  (lv, r) => { const n = r.int(2000, 9999) * scale(lv); return { stem: `Round ${n} to the nearest thousand.`, answer: numAns(Math.round(n / 1000) * 1000, undefined, [Math.floor(n / 1000) * 1000 + 1000 * (n % 1000 < 500 ? 1 : -1), Math.round(n / 100) * 100, n]) }; },
];

const fractions: Maker[] = [
  (lv, r) => {
    const d1 = r.pick([2, 3, 4, 5]), d2 = d1 * r.pick([2, 3]), n1 = r.int(1, d1 - 1), n2 = r.int(1, d2 - 1);
    const num = n1 * (d2 / d1) + n2, den = d2, g = gcd(num, den);
    const sn = num / g, sd = den / g;
    const whole = Math.floor(sn / sd);
    const spec: AnswerSpec = sd === 1 ? { kind: "number", value: sn } : whole ? { kind: "fraction", num: sn - whole * sd, den: sd, whole } : { kind: "fraction", num: sn, den: sd };
    const text = sd === 1 ? String(sn) : whole ? `$${whole}\\frac{${sn - whole * sd}}{${sd}}$` : lat(sn, sd);
    return { stem: `Find the value of ${lat(n1, d1)} + ${lat(n2, d2)}. Give your answer in simplest form.`, answer: { spec, display: sd === 1 ? String(sn) : whole ? `${whole} ${sn - whole * sd}/${sd}` : `${sn}/${sd}`, text, wrong: [lat(n1 + n2, d1 + d2), lat(n1 + n2, d2), lat(sn + 1, sd + 1)] } };
  },
  (lv, r) => { const a = r.int(1, 4), b = r.int(2, 5), c = r.int(1, 4), d = r.int(2, 5); const n = a * c, den = b * d, g = gcd(n, den); return { stem: `${lat(a, b)} × ${lat(c, d)} = ?`, answer: { spec: den / g === 1 ? { kind: "number", value: n / g } : { kind: "fraction", num: n / g, den: den / g }, display: `${n / g}/${den / g}`, text: lat(n / g, den / g), wrong: [lat(a + c, b + d), lat(n, b + d), lat(n / g + 1, den / g)] } }; },
  (lv, r) => { const q = r.int(2, 9) * 4 * scale(lv), n = r.pick([1, 3]), d = 4; return { stem: `${NAMES[r.int(0, 9)]} had ${q} stickers. She gave ${lat(n, d)} of them to her friend. How many stickers did she give away?`, answer: numAns((q * n) / d, undefined, [q - (q * n) / d, q / n, (q * n) / d + 4]) }; },
];

const money: Maker[] = [
  (lv, r) => { const p = r.int(4, 40) * 5 * scale(lv), off = r.pick([10, 20, 25, 30]); const v = p * (1 - off / 100); return { stem: `A bag costs ＄${p}. It is sold at a discount of ${off}%. What is the new price of the bag?`, answer: numAns(v, undefined, [p * (off / 100), p - off, v + 5], true) }; },
  (lv, r) => { const p = r.int(2, 9) * 0.5 + 1, n = r.int(3, 9) * scale(lv); return { stem: `A pen costs ＄${p.toFixed(2)}. How much do ${n} such pens cost?`, answer: numAns(p * n, undefined, [p + n, p * n + 1, p * (n - 1)], true) }; },
  (lv, r) => { const w = r.int(2, 9) * 40 * scale(lv), p = r.pick([5, 15, 20, 40, 60]); return { stem: `What is ${p}% of ${w}?`, answer: numAns((w * p) / 100, undefined, [(w * p) / 10, w - (w * p) / 100, (w * p) / 100 + p]) }; },
  (lv, r) => { const p = r.pick([10, 20, 25, 50]), part = r.int(2, 9) * 4; return { stem: `${part} is ${p}% of a number. Find the number.`, answer: numAns((part * 100) / p, undefined, [part * p, (part * 100) / p + part, part / p]) }; },
];

const ratio: Maker[] = [
  (lv, r) => { const k = r.int(2, 6), a = r.int(1, 5), b = a + r.int(1, 4); const g = gcd(a, b), sa = a / g, sb = b / g; return { stem: `Express the ratio ${a * k * g} : ${b * k * g} in its simplest form.`, answer: { spec: { kind: "ratio", terms: [sa, sb] }, display: `${sa}:${sb}`, text: `${sa} : ${sb}`, wrong: [`${sb} : ${sa}`, `${a * k} : ${b * k + 1}`, `${sa + 1} : ${sb}`] } }; },
  (lv, r) => { const a = r.int(2, 5), b = r.int(3, 7), t = (a + b) * r.int(3, 9) * scale(lv); const v = (t / (a + b)) * a; return { stem: `The ratio of ${NAMES[r.int(0, 4)]}'s marbles to ${NAMES[r.int(5, 9)]}'s marbles is ${a} : ${b}. They have ${t} marbles altogether. How many marbles does the first child have?`, answer: numAns(v, undefined, [t - v, t / a, v + a]) }; },
];

const area: Maker[] = [
  (lv, r) => { const l = r.int(4, 20) * scale(lv), w = r.int(3, 12); return { stem: `A rectangle has a length of ${l} cm and a width of ${w} cm.`, figure: "rect", parts: [{ label: "Find its area.", spec: { kind: "number", value: l * w, unit: "cm²" }, display: `${l * w} cm²` }, { label: "Find its perimeter.", spec: { kind: "number", value: 2 * (l + w), unit: "cm" }, display: `${2 * (l + w)} cm` }], answer: numAns(l * w, "cm²", [2 * (l + w), l + w, l * w + l]) }; },
  (lv, r) => { const b = r.int(3, 15) * 2 * scale(lv), h = r.int(3, 12); return { stem: `The base of a triangle is ${b} cm and its height is ${h} cm. Find its area.`, figure: "rect", answer: numAns((b * h) / 2, "cm²", [b * h, b + h, (b * h) / 2 + b]) }; },
];

const angles: Maker[] = [
  (lv, r) => { const a = r.int(20, 80) + scale(lv), b = r.int(20, 60); return { stem: `In the figure, $\\angle ABC = ${a}^\\circ$ and $\\angle CBD = ${b}^\\circ$ lie on a straight line AD. Find $\\angle x$.`, figure: "angle", answer: numAns(180 - a - b, "°", [180 - a, a + b, 90 - b]) }; },
  (lv, r) => { const a = r.int(30, 80), b = r.int(30, 70); return { stem: `Two angles of a triangle are ${a}$^\\circ$ and ${b}$^\\circ$. Find the third angle.`, answer: numAns(180 - a - b, "°", [360 - a - b, a + b, 180 - a]) }; },
];

const circles: Maker[] = [
  (lv, r) => { const rad = r.int(2, 10) * 7 * (lv > 1 ? 1 : 1); return { stem: `Find the circumference of a circle with radius ${rad} cm. (Take $\\pi = \\frac{22}{7}$.)`, figure: "circle", answer: numAns(2 * (22 / 7) * rad, "cm", [(22 / 7) * rad, (22 / 7) * rad * rad, 2 * rad]) }; },
  (lv, r) => { const rad = r.int(2, 9); const v = Math.round(3.14 * rad * rad * 100) / 100; return { stem: `The radius of a circle is ${rad} cm. Find its area. (Take $\\pi = 3.14$.)`, answer: numAns(v, "cm²", [Math.round(2 * 3.14 * rad * 100) / 100, Math.round(3.14 * rad * 2 * rad * 100) / 100, v + rad]) }; },
];

const algebra: Maker[] = [
  (lv, r) => { const n = r.int(2, 9), k = r.int(2, 6), c = r.int(1, 9) * scale(lv); return { stem: `Find the value of $${k}n + ${c}$ when $n = ${n}$.`, answer: numAns(k * n + c, undefined, [k + n + c, k * (n + c), k * n - c]) }; },
  (lv, r) => { const a = r.int(2, 6), b = r.int(1, 5), c = r.int(1, 6), d = r.int(1, 4); return { stem: `Simplify $${a}x + ${b} + ${c}x + ${d}$.`, answer: { spec: { kind: "text", accepted: [`${a + c}x+${b + d}`, `${b + d}+${a + c}x`] }, display: `${a + c}x + ${b + d}`, text: `$${a + c}x + ${b + d}$`, wrong: [`$${a + c}x + ${b}$`, `$${a * c}x + ${b + d}$`, `$${a + c + b + d}x$`] } }; },
  (lv, r) => { const x = r.int(3, 15), k = r.int(2, 5), c = r.int(2, 9) * scale(lv); return { stem: `Solve $${k}x - ${c} = ${k * x - c}$.`, answer: numAns(x, undefined, [x + 1, x - 1, k * x - c]) }; },
];

const data: Maker[] = [
  (lv, r) => {
    const xs = [r.int(10, 40), r.int(10, 40), r.int(10, 40), r.int(10, 40)];
    xs[3] += (4 - (xs.reduce((x, y) => x + y, 0) % 4)) % 4; // make the average whole
    const tot = xs.reduce((x, y) => x + y, 0);
    return { stem: `The marks of 4 pupils are ${xs.join(", ")}. What is their average mark?`, answer: numAns(tot / 4, undefined, [tot, tot / 3, tot / 4 + 2]) };
  },
  (lv, r) => { const avg = r.int(20, 60), n = r.int(3, 9); return { stem: `The average weight of ${n} boxes is ${avg} kg. What is the total weight of the boxes?`, answer: numAns(avg * n, "kg", [avg + n, avg / n, avg * n + avg]) }; },
];

const rate: Maker[] = [
  (lv, r) => { const sp = r.int(4, 12) * 5, t = r.int(2, 6); return { stem: `A car travels at ${sp} km/h for ${t} hours. How far does it travel?`, answer: numAns(sp * t, "km", [sp + t, sp / t, sp * t + sp]) }; },
  (lv, r) => { const t = r.int(2, 8), sp = r.int(3, 9) * 10; return { stem: `A train travels ${sp * t} km in ${t} hours. Find its average speed in km/h.`, answer: numAns(sp, "km/h", [sp * t, sp + t, sp / 2]) }; },
];

const volume: Maker[] = [
  (lv, r) => { const l = r.int(3, 12) * (lv > 2 ? 2 : 1), w = r.int(3, 9), h = r.int(2, 8); return { stem: `A cuboid measures ${l} cm by ${w} cm by ${h} cm.`, figure: "cuboid", parts: [{ label: "Find its volume.", spec: { kind: "number", value: l * w * h, unit: "cm³" }, display: `${l * w * h} cm³` }, { label: "How many litres of water can it hold? (1 ℓ = 1000 cm³; give your answer to 2 decimal places)", spec: { kind: "number", value: Math.round(l * w * h * 0.1) / 100, unit: "ℓ" }, display: `${Math.round(l * w * h * 0.1) / 100} ℓ` }], answer: numAns(l * w * h, "cm³", [l + w + h, 2 * (l * w + w * h + l * h), l * w * h + l]) }; },
  (lv, r) => { const s = r.int(2, 9); return { stem: `Find the volume of a cube of side ${s} cm.`, answer: numAns(s ** 3, "cm³", [s * s, 6 * s * s, s * 3]) }; },
];

const solids: Maker[] = [
  (lv, r) => { const [name, f] = r.pick<[string, number]>([["cube", 6], ["triangular prism", 5], ["square-based pyramid", 5], ["cuboid", 6]]); return { stem: `How many faces does a ${name} have?`, answer: numAns(f, undefined, [f + 1, f - 1, f + 3]) }; },
  (lv, r) => { const [name, e] = r.pick<[string, number]>([["cube", 12], ["triangular prism", 9], ["square-based pyramid", 8]]); return { stem: `How many edges does a ${name} have?`, answer: numAns(e, undefined, [e + 2, e - 1, e + 4]) }; },
];

const drawing: Maker[] = [
  (lv, r) => { const [name, n] = r.pick<[string, number]>([["square", 4], ["equilateral triangle", 3], ["rectangle", 2], ["regular hexagon", 6]]); return { stem: `How many lines of symmetry does a ${name} have?`, answer: numAns(n, undefined, [n + 1, n - 1, n * 2]) }; },
  (lv, r) => { const a = r.pick([30, 45, 60, 75, 120]); return { stem: `A pupil draws an angle of ${a}$^\\circ$ with a protractor. What is the size of the angle on a straight line next to it?`, answer: numAns(180 - a, "°", [a, 90 - (a % 90), 360 - a]) }; },
  (lv, r) => ({ stem: `Draw an angle of ${r.pick([30, 45, 60, 75, 120])}$^\\circ$ using a protractor.`, openOnly: true, noMark: true }),
  (lv, r) => { const n = r.int(3, 8); return { stem: `How many sides does a polygon have if it is drawn with ${n} vertices?`, answer: numAns(n, undefined, [n + 1, n - 1, n * 2]) }; },
];

const MAKERS: Record<string, Maker[]> = {
  Algebra: algebra, "Angles in Geometric Figures": angles, "Area and Perimeter": area, Arithmetic: arithmetic, Circles: circles,
  "Data Representation": data, Drawing: drawing, Fractions: fractions, Percentage: money, Rate: rate, Ratio: ratio,
  "Solid Figures and Nets": solids, "Volume of Solids and Liquids": volume,
};

// ---- figures: simple generated placeholder (shapes only, no fonts needed) ----
function figureSvg(kind: NonNullable<Gen["figure"]>, seed: number): string {
  const hue = seed % 360;
  const c = `hsl(${hue},60%,70%)`;
  const shape =
    kind === "rect" ? `<rect x="60" y="60" width="280" height="160" fill="${c}" stroke="#333" stroke-width="4"/>`
    : kind === "circle" ? `<circle cx="200" cy="140" r="100" fill="${c}" stroke="#333" stroke-width="4"/><line x1="200" y1="140" x2="300" y2="140" stroke="#333" stroke-width="4"/>`
    : kind === "angle" ? `<line x1="40" y1="220" x2="360" y2="220" stroke="#333" stroke-width="4"/><line x1="200" y1="220" x2="300" y2="60" stroke="#333" stroke-width="4"/><path d="M240 220 A40 40 0 0 0 228 190" fill="none" stroke="#c33" stroke-width="4"/>`
    : `<polygon points="80,100 240,100 240,220 80,220" fill="${c}" stroke="#333" stroke-width="4"/><polygon points="80,100 140,60 300,60 240,100" fill="hsl(${hue},60%,82%)" stroke="#333" stroke-width="4"/><polygon points="240,100 300,60 300,180 240,220" fill="hsl(${hue},60%,55%)" stroke="#333" stroke-width="4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280"><rect width="400" height="280" fill="#fff"/>${shape}</svg>`;
}

const PAPER: Record<Difficulty, Paper> = { LV1: "Paper 1 Booklet A", LV2: "Paper 1 Booklet B", LV3: "Paper 2" };

export async function runMock(grade: Grade, opts: { contentRoot?: string; perSubtopic?: number } = {}) {
  const perSub = opts.perSubtopic ?? 30; // 10 per level
  const defs: SubtopicDef[] = [];
  const candidates: SelCandidate[] = [];
  const figures: FigureSource[] = [];
  const topics = Object.keys(MOCK_SUBTOPICS);
  topics.forEach((topic, ti) => {
    MOCK_SUBTOPICS[topic].forEach((name, si) => {
      const def: SubtopicDef = { id: subtopicId(grade, topic, name), topic, name };
      defs.push(def);
      const makers = MAKERS[topic];
      for (let j = 0; j < perSub; j++) {
        const lvIdx = Math.floor(j / (perSub / 3));
        const lv = (lvIdx + 1) as 1 | 2 | 3;
        const difficulty = `LV${lv}` as Difficulty;
        const id = `mock-${slugify(topic)}-${si + 1}-${String(j + 1).padStart(2, "0")}`;
        const r = rng(hashStr(id));
        const g = makers[(j + si) % makers.length](lv, r);
        const year = 2018 + ((j + si) % 7);
        const mcq = lv === 1 && !g.openOnly && !!g.answer;
        const paper = PAPER[difficulty];
        const q: Question = {
          id, grade, year, topic, topics: [topic], subtopicId: def.id, difficulty,
          type: mcq ? "mcq" : "open", paper, calculatorAllowed: paper === "Paper 2",
          stem: tokenize(g.stem), autoMarkable: !g.noMark,
        };
        if (g.figure && (j % 3 === 0)) {
          q.figure = id;
          figures.push({ id, input: Buffer.from(figureSvg(g.figure, hashStr(id))) });
        }
        if (mcq && g.answer) {
          const opts = r.shuffle([{ t: g.answer.text, c: true }, ...[...new Set(g.answer.wrong)].filter((w) => w !== g.answer!.text).slice(0, 3).map((t) => ({ t, c: false }))]);
          q.options = opts.map((o, i) => ({ key: String(i + 1) as "1" | "2" | "3" | "4", text: tokenize(o.t) }));
          q.correctOption = String(opts.findIndex((o) => o.c) + 1) as "1" | "2" | "3" | "4";
        } else if (g.noMark) {
          q.parts = [{ part: "", answer: { kind: "text", accepted: [] }, display: "Teacher check: see worked solution" }];
        } else if (g.parts && lv > 1) {
          q.parts = g.parts.map((p, i): AnswerPart => ({ part: "ab"[i], label: tokenize(`(${"ab"[i]}) ${p.label}`), answer: p.spec, display: p.display }));
        } else if (g.answer) {
          q.parts = [{ part: "", answer: g.answer.spec, display: g.answer.display }];
        }
        candidates.push({ q, verified: (j + ti) % 4 !== 0, hasError: false, school: ["Nanyang", "Raffles", "Rosyth", "Tao Nan"][(j + si) % 4] });
      }
    });
  });
  const curriculum = buildCurriculum({ grade, version: "", subtopics: defs, candidates });
  const res = await writeOutputs({
    grade, questions: candidates.map((c) => c.q), curriculum: { grade, topics: curriculum.topics },
    figures, contentRoot: opts.contentRoot ?? assetsContentRoot(), versionPrefix: "mock-",
  });
  return { ...res, questions: candidates.length, subtopics: defs.length };
}
