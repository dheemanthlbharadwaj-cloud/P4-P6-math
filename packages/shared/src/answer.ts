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
      "dollars?", "cents?", "c", "°c", "°f", "℃", "°", "%", "degrees?", "deg",
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
  s = s.replace(/\s+/g, " ");
  // currency prefix
  s = s.replace(/^([+-]?)\s*\$\s*/, "$1");
  s = s.replace(/^(?:s\$|sgd)\s*/, "");
  // thousands separators: 1,234 / 1,234,567.5
  s = s.replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1").replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1");
  // "x = 5" style prefix
  s = s.replace(/^[a-z]\s*=\s*(?=[-+\d.$])/, "");
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
        return false;
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
