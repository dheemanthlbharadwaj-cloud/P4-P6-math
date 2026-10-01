// Source answer → AnswerSpec extraction.
import { checkAnswer, normalizeInput, type AnswerPart, type AnswerSpec } from "@p6/shared";
import { richToPlain, tokenize, type TokenizeStats } from "./tokenizer";

export interface RawAnswer {
  value?: unknown; // answer / value
  fraction?: unknown; // answer_fraction / fraction
  symbol?: unknown; // answer_symbol / symbol
  unit?: unknown;
}

const str = (v: unknown): string => (v == null ? "" : String(v).trim());

/** LaTeX-ish answer text → plain string, e.g. "$\frac{3}{4}$ kg" → "3/4 kg". */
export function plainAnswer(v: unknown, stats?: TokenizeStats): string {
  const s = str(v);
  if (!s) return "";
  return richToPlain(tokenize(s, stats)).replace(/\s+/g, " ").trim();
}

const MONEY = /[＄$]/;

/** The editor stores part fractions as {numerator, denominator, whole}; turn any such object into "w n/d". */
function fractionText(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  const n = Number(o.numerator ?? o.num), d = Number(o.denominator ?? o.den), w = Number(o.whole ?? 0);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
  return w ? `${w} ${n}/${d}` : `${n}/${d}`;
}

/** Answers that are instructions to the student rather than something to type. */
const NOT_TYPEABLE = /^(drawing required|draw|shade|show|explain|complete the|construct|mark)\b/i;

function fromNormalized(norm: string, unit: string | undefined, money: boolean): AnswerSpec | null {
  const u = unit ? { unit } : {};
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(norm)) {
    const value = parseFloat(norm);
    return money ? { kind: "number", value, tolerance: 0.005, unit: unit ?? "$" } : { kind: "number", value, ...u };
  }
  const f = norm.match(/^([+-]?)(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (f && parseInt(f[4], 10) !== 0) {
    const sign = f[1] === "-" ? -1 : 1;
    const spec: AnswerSpec = { kind: "fraction", num: sign * parseInt(f[3], 10), den: parseInt(f[4], 10), ...u };
    if (f[2]) spec.whole = sign * parseInt(f[2], 10);
    return spec;
  }
  if (/^\d+(\.\d+)?(:\d+(\.\d+)?)+$/.test(norm)) return { kind: "ratio", terms: norm.split(":").map(Number) };
  return null;
}

export interface ExtractResult {
  spec: AnswerSpec;
  display: string;
  autoMarkable: boolean;
}

/** Turn one source answer into an AnswerSpec. Falls back to a non-auto-markable text spec holding the raw answer. */
export function extractSpec(raw: RawAnswer, stats?: TokenizeStats): ExtractResult {
  const unitRaw = plainAnswer(raw.unit, stats);
  const symbol = str(raw.symbol);
  const valuePlain = plainAnswer(raw.value, stats);
  const fracPlain = plainAnswer(fractionText(raw.fraction), stats);
  const symPlain = plainAnswer(raw.symbol, stats);
  const money = MONEY.test(symbol) || MONEY.test(valuePlain) || MONEY.test(fracPlain) || /^(dollars?|\$)$/i.test(unitRaw);
  const unit = unitRaw && !/^(dollars?|\$)$/i.test(unitRaw) ? unitRaw : money ? "$" : undefined;

  const displayOf = (core: string) => {
    const withSym = money && !MONEY.test(core) ? "＄" + core : core;
    return unitRaw && !money && !withSym.toLowerCase().endsWith(unitRaw.toLowerCase()) ? `${withSym} ${unitRaw}` : withSym;
  };

  const attempts: string[] = [];
  if (fracPlain) attempts.push(fracPlain);
  if (valuePlain) attempts.push(valuePlain);
  // answer_symbol often holds the only answer ("10 1/2", "5 : 4", "520%")
  if (symPlain) attempts.push(symPlain, symPlain.replace(/%$/, ""));
  for (const a of attempts) {
    const norm = normalizeInput(a);
    const spec = fromNormalized(norm, unit, money);
    if (spec && checkAnswer(spec, a)) return { spec, display: displayOf(a), autoMarkable: true };
  }

  // short textual answers ("isosceles triangle", "3x + 2")
  const text = valuePlain || fracPlain || symPlain;
  if (text && NOT_TYPEABLE.test(text)) return { spec: { kind: "text", accepted: [text] }, display: text, autoMarkable: false };
  if (text) {
    const words = text.split(/\s+/).length;
    const isShort = text.length <= 40 && words <= 5 && !/[.!?]\s+\w/.test(text);
    // multi-value answers like "3 or 5" are text but only matched literally
    if (isShort) {
      const accepted = [text, ...text.split(/\s+or\s+/i).filter((x) => x !== text)];
      return { spec: { kind: "text", accepted }, display: displayOf(text), autoMarkable: true };
    }
    return { spec: { kind: "text", accepted: [text] }, display: displayOf(text), autoMarkable: false };
  }
  return { spec: { kind: "text", accepted: [] }, display: "", autoMarkable: false };
}

/** Split "(a) 5 (b) 6" style answers into parts. Returns null if not splittable. */
export function splitLetteredAnswer(text: string): { part: string; value: string }[] | null {
  const re = /\(([a-z])\)\s*/g;
  const marks: { part: string; idx: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) marks.push({ part: m[1], idx: m.index, end: re.lastIndex });
  if (marks.length < 2) return null;
  return marks.map((mk, i) => ({
    part: mk.part,
    value: text.slice(mk.end, i + 1 < marks.length ? marks[i + 1].idx : undefined).replace(/[,;]\s*$/, "").trim(),
  }));
}

export type { AnswerPart };
