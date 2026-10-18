// Answer checking — pure, shared by the app (marking) and the content pipeline (autoMarkable check).
// Signatures are frozen.
import type { AnswerSpec, Question } from "./types";

const MONEY_TOLERANCE = 0.005;

const VULGAR: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

// Known trailing units (lowercase), longest alternatives first.
const UNIT_RE = new RegExp(
  "\\s*(?:" +
    [
      "km\\/h", "km\\/hr", "m\\/s", "cm\\s*(?:2|²|\\^2|sq)", "cm\\s*(?:3|³|\\^3)", "m\\s*(?:2|²|\\^2)", "m\\s*(?:3|³|\\^3)",
      "sq\\.?\\s*(?:cm|m|km)", "square\\s*(?:cm|m|km|units)", "cubic\\s*(?:cm|m)", "units?",
      "km", "cm", "mm", "m", "kg", "mg", "g", "ml", "mℓ", "ℓ", "l", "litres?", "liters?",
      "minutes?", "mins?", "hours?", "hrs?", "h", "seconds?", "secs?", "s", "days?", "weeks?", "years?",
      "dollars?", "cents?", "c", "¢", "°c", "°f", "℃", "°", "%", "degrees?", "deg",
    ].join("|") +
    ")\\.?$",
  "i",
);

/** Normalize raw student input (trim, strip units/＄/commas, unify unicode minus, etc.). */
export function normalizeInput(raw: string): string {
  let s = String(raw ?? "");
  for (const [k, v] of Object.entries(VULGAR)) s = s.split(k).join(" " + v);
  s = s.normalize("NFKC").replace(/⁄|∕/g, "/");
  s = s.replace(/[−–—‒‐‑﹣－]/g, "-");
  s = s.replace(/[   　]/g, " ").trim().toLowerCase();
  s = s.replace(/\s+/g, " ").replace(/ℓ/g, "l"); // litre: ℓ, l and L are the same unit
  // currency prefix
  s = s.replace(/^([+-]?)\s*\$\s*/, "$1");
  s = s.replace(/^(?:s\$|sgd)\s*/, "");
  // thousands separators: 1,234 / 1,234,567.5
  s = s.replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1").replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
  // "x = 5" style prefix
  s = s.replace(/^[a-z]\s*=\s*(?=[-+\d.$])/, "");
  // Singapore-style grouped thousands: "204 920" (only exact 3-digit groups, and not inside a fraction or ratio)
  s = s.replace(/(?<![\d./:])(\d{1,3}(?: \d{3})+)(?![\d/:]|\.\d*\/)/g, (g) => g.replace(/ /g, ""));
  // trailing units, only if what precedes looks numeric
  const m = s.match(UNIT_RE);
  if (m && m.index !== undefined) {
    const head = s.slice(0, m.index).trim();
    if (/[\d)]$/.test(head)) s = head;
  }
  s = s.replace(/^([+-])\s+(?=[\d.])/, "$1");
  s = s.replace(/\s*\/\s*/g, "/").replace(/\s*:\s*/g, ":");
  s = s.replace(/^(\d+)\.$/, "$1");
  return s.trim();
}

type Parsed = { kind: "num"; value: number } | { kind: "ratio"; terms: number[] } | null;

const NUM_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const FRAC_RE = /^([+-]?)(?:(\d+)\s+)?(\d+)\/(\d+)$/;

function parseStrict(s: string): Parsed {
  if (NUM_RE.test(s)) return { kind: "num", value: parseFloat(s) };
  const f = s.match(FRAC_RE);
  if (f) {
    const den = parseInt(f[4], 10);
    if (den === 0) return null;
    const v = (f[2] ? parseInt(f[2], 10) : 0) + parseInt(f[3], 10) / den;
    return { kind: "num", value: f[1] === "-" ? -v : v };
  }
  if (s.includes(":")) {
    const parts = s.split(":");
    const terms = parts.map((p) => (NUM_RE.test(p) ? parseFloat(p) : NaN));
    if (parts.length >= 2 && terms.every((t) => !isNaN(t))) return { kind: "ratio", terms };
  }
  return null;
}

/** Parse a normalized string; tolerates unknown trailing words ("5 apples") when the head is numeric. */
function parseValue(norm: string): Parsed {
  const strict = parseStrict(norm);
  if (strict) return strict;
  const m = norm.match(/^(.*?[\d)\/])\s*[^\d\s/:.\-+][^\d]*$/);
  if (m) return parseStrict(m[1].trim());
  return null;
}

function close(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= Math.max(tol, 1e-9 * Math.max(1, Math.abs(b)));
}

const compact = (s: string) => s.replace(/[\s.]+$/g, "").replace(/\s+/g, "");

function isMoney(spec: AnswerSpec, raw: string): boolean {
  const unit = (spec as { unit?: string }).unit;
  return /^\s*[+-]?\s*[$＄]/.test(raw) || (!!unit && /[$＄]|dollar/i.test(unit));
}

// ---------- Forgiving text matching ----------
// Used for kind "text" after the exact comparison fails, so it can only ADD accepted answers. Same code in the app and on
// the server (copy-shared). Two steps: (1) same words ignoring case, punctuation (, . ; : ! ?), spacing and "&" = "and";
// (2) "key tokens": every number, fraction, single letter, operator and am/pm of the accepted answer must be in the
// response, in the same order, and the response may only add filler. Label words may be left out or abbreviated
// ("Row 96, Column C" accepts "96 C", "R96 C", "row 96 col c" but never "C", "96", "Row 96, Column D" or "Row 95, Column C").

const FILLER = new Set(["and", "the", "is", "are", "was", "it", "its", "my", "answer", "ans"]);
const OPS = "+-×÷*/=()^<>";

/** Lowercase, unify symbols, "&" → "and", drop , ; ! ? and the dots/colons that are not part of a number or time. */
function looseNorm(s: string): string {
  let t = String(s ?? "").normalize("NFKC").toLowerCase().replace(/ℓ/g, "l");
  t = t.replace(/[−–—‒‐‑﹣－]/g, "-").replace(/&/g, " and ");
  t = t.replace(/\b([ap])\s*\.?\s*m\b\.?/g, "$1m"); // p.m. / p m / pm
  t = t.replace(/²/g, "^2").replace(/³/g, "^3").replace(/\b(mm|cm|km|m)(?:\s*\^\s*)?([23])(?!\d)/g, (m, u, n) => (/\^/.test(m) || m.length === u.length + 1 ? u + (n === "2" ? "sq" : "cu") : m)); // cm^2, cm², cm2 → one unit word
  t = t.replace(/(\d),(?=\d{3}(?!\d))/g, "$1"); // 1,250
  t = t.replace(/[,;!?]/g, " ").replace(/\.(?!\d)|(?<!\d)\./g, " ").replace(/:(?!\d)|(?<!\d):/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

type Tok = { v: string; data: boolean };
/** Tokens: numbers (decimals, times) and fractions, runs of letters (a lone letter is data), operators; digits and letters are split ("5y" = 5, y). */
function tokens(s: string, articles = true): Tok[] {
  const out: Tok[] = [];
  const re = new RegExp(`\\d+(?:[./:]\\d+)*|[a-zà-ÿπ]+|[${OPS.replace(/[-^]/g, "\\$&")}]|[%°¢$]`, "g");
  for (const m of looseNorm(s).matchAll(re)) {
    const v = m[0];
    const isNum = /^\d/.test(v), isOp = v.length === 1 && OPS.includes(v);
    const isWord = /^[a-zà-ÿπ]+$/.test(v);
    out.push({ v, data: isNum || isOp || (isWord && (v.length === 1 || v === "am" || v === "pm" || v === "π")) });
  }
  // "a" before a word is the article, not a variable (accepted "a right angle") - in both answer and response
  for (let i = 0; articles && i < out.length - 1; i++) if (out[i].v === "a" && /^[a-z]{2,}$/.test(out[i + 1].v)) out[i].data = false;
  return out;
}

function looseTextMatch(accepted: string, response: string): boolean {
  // (1) same words, ignoring case/punctuation/spacing
  const a = looseNorm(accepted), r = looseNorm(response);
  if (!a || !r) return false;
  if (a === r || a.replace(/ /g, "") === r.replace(/ /g, "")) return true;
  const bare = (x: string) => (/^(?:a|an|the) [a-z]{2,}/.test(x) && !/\d|\b[a-z]\b/.test(x.replace(/^(?:a|an|the) /, "")) ? x.replace(/^(?:a|an|the) /, "") : x);
  if (bare(a) === bare(r)) return true; // a leading article does not matter in a word answer
  // (2) key tokens
  const at = tokens(accepted, /(?:^|\s)a\s+[A-Za-z]{2,}/.test(accepted)); // a capital "A" (a name, a letter) is data, not the article
  if (!at.some((t) => t.data)) return false; // pure words: only the exact comparison above
  const words = at.filter((t) => !t.data && /^[a-z]{2,}$/.test(t.v)).map((t) => t.v);
  let rt = tokens(response);
  // abbreviations: "col" → column; a lone letter right before a number ("R96") → the label word it starts
  rt = rt.map((t, i) => {
    if (t.v === "a" && !t.data) return t;
    if (/^[a-z]{2,}$/.test(t.v) && !words.includes(t.v)) {
      const w = words.find((x) => x.startsWith(t.v));
      return w ? { v: w, data: false } : t;
    }
    if (t.v.length === 1 && /[a-z]/.test(t.v) && /^\d/.test(rt[i + 1]?.v ?? "") && words.some((x) => x[0] === t.v)) return { v: words.find((x) => x[0] === t.v)!, data: false };
    return t;
  });
  rt = rt.filter((t) => t.data || !FILLER.has(t.v));
  let j = 0;
  for (const t of at) {
    if (j < rt.length && rt[j].v === t.v) j++;
    else if (t.data) return false; // a number, letter or operator is missing or different
  }
  return j === rt.length; // nothing extra or contradictory left in the response
}

/** True if `raw` satisfies `spec`. Accepts equivalent forms: 0.5 = 1/2, 1 1/2 = 3/2 = 1.5, "3 : 4" = "3:4". */
export function checkAnswer(spec: AnswerSpec, raw: string): boolean {
  if (raw == null || String(raw).trim() === "") return false;
  const norm = normalizeInput(raw);
  if (norm === "") return false;
  switch (spec.kind) {
    case "number": {
      const p = parseValue(norm);
      if (!p || p.kind !== "num") return false;
      const tol = spec.tolerance ?? (isMoney(spec, raw) ? MONEY_TOLERANCE : 0);
      return close(p.value, spec.value, tol);
    }
    case "fraction": {
      if (spec.den === 0) return false;
      const p = parseValue(norm);
      if (!p || p.kind !== "num") return false;
      const target = (spec.whole ?? 0) + spec.num / spec.den;
      return close(p.value, target, 0);
    }
    case "ratio": {
      const p = parseValue(norm);
      if (!p || p.kind !== "ratio" || p.terms.length !== spec.terms.length) return false;
      return p.terms.every((t, i) => close(t, spec.terms[i], 0));
    }
    case "text": {
      const cands = new Set([compact(norm), compact(String(raw).normalize("NFKC").toLowerCase())]);
      return spec.accepted.some((a) => {
        const ca = new Set([compact(normalizeInput(a)), compact(a.normalize("NFKC").toLowerCase())]);
        for (const c of cands) if (ca.has(c)) return true;
        return looseTextMatch(a, String(raw)); // forgiving match, only ever adds accepted answers
      });
    }
  }
}

/** Mark a whole question. MCQ: `responses[0]` is the option key. Open: one response per part, in order. */
export function markQuestion(q: Question, responses: string[]): { correct: boolean; perPart: boolean[] } {
  if (q.type === "mcq") {
    const ok = !!q.correctOption && String(responses[0] ?? "").trim() === q.correctOption;
    return { correct: ok, perPart: [ok] };
  }
  const parts = q.parts ?? [];
  const perPart = parts.map((p, i) => checkAnswer(p.answer, responses[i] ?? ""));
  return { correct: perPart.length > 0 && perPart.every(Boolean), perPart };
}
