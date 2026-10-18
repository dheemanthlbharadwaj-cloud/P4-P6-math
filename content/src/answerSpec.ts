// Source answer → AnswerSpec extraction.
import { checkAnswer, normalizeInput, type AnswerPart, type AnswerSpec } from "@p6/shared";
import { richToPlain, tokenize, type TokenizeStats } from "./tokenizer";

export interface RawAnswer {
  value?: unknown; // answer / value
  fraction?: unknown; // answer_fraction / fraction
  symbol?: unknown; // answer_symbol / symbol
  unit?: unknown;
  /** The question (or part prompt) mentions dollars: lets an algebraic answer such as "$5p+4$" keep its "＄" (see extractSpec). */
  moneyContext?: boolean;
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

/**
 * "<number> <unit words>" that the checker's unit list does not know: "22 cupcakes", "6 years old", "15 L/min", "32¢",
 * "40 ＄" or a space-grouped amount like "$204 920". Single quantities only: a second number, a list ("1, 2, 3"), a
 * connector ("15 and 21"), brackets, a time of day ("2 p.m.") or a duration ("10 h 45 min") stay text.
 */
const NUM_CORE = String.raw`[+-]?(?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d+)?`;
const NUM_UNIT_WORDS = new RegExp(String.raw`^(${NUM_CORE})(?:\s*([¢%°])|\s+([A-Za-zµℓ][A-Za-zµℓ°²³^/.-]*(?:\s+[A-Za-zµℓ][A-Za-zµℓ°²³^/.-]*){0,3}))$`);
const NOT_UNIT_WORD = /^(and|or|to|a\.?m\.?|p\.?m\.?|am|pm|from|until|till|total|than)$/i;
const SPACE_GROUPED = new RegExp(String.raw`^([＄$])?\s*(\d{1,3}(?: \d{3})+(?:\.\d+)?)$`);

function fromNumberUnitWords(text: string): { spec: AnswerSpec; display: string } | null {
  const t = text.normalize("NFKC").trim();
  const grouped = t.match(SPACE_GROUPED);
  if (grouped) {
    const value = parseFloat(grouped[2].replace(/ /g, ""));
    return grouped[1] ? { spec: { kind: "number", value, tolerance: 0.005, unit: "$" }, display: text } : { spec: { kind: "number", value }, display: text };
  }
  // trailing money symbol: "40 ＄"
  const trail = t.match(/^(\d+(?:\.\d+)?)\s*\$$/);
  if (trail) return { spec: { kind: "number", value: parseFloat(trail[1]), tolerance: 0.005, unit: "$" }, display: `＄${trail[1]}` };
  const m = t.match(NUM_UNIT_WORDS);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/[ ,]/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] ?? m[3] ?? "").replace(/[.]+$/, "").trim();
  const words = unit.split(/\s+/);
  if (!unit || words.some((w) => NOT_UNIT_WORD.test(w)) || (unit.length === 1 && /[A-Za-z]/.test(unit))) return null;
  return { spec: { kind: "number", value, unit }, display: text };
}

export interface ExtractResult {
  spec: AnswerSpec;
  display: string;
  autoMarkable: boolean;
}

/** Turn one source answer into an AnswerSpec. Falls back to a non-auto-markable text spec holding the raw answer. */
export function extractSpec(raw: RawAnswer, stats?: TokenizeStats): ExtractResult {
  // a bare unit "l" is a litre (no number before it, so litreSymbol does not reach it)
  const unitRaw = plainAnswer(raw.unit, stats).replace(/^l$/, "ℓ");
  const valuePlain = plainAnswer(raw.value, stats);
  const fracPlain = plainAnswer(fractionText(raw.fraction), stats);
  const symPlain = plainAnswer(raw.symbol, stats);
  // Money is a currency symbol in the answer itself. The "$" that delimits LaTeX math in answer_symbol ("$\\frac{7}{20}$",
  // "$68^\\circ$") is NOT money (it used to be counted, which put "＄" on angles, areas and fractions).
  const legacyMoney = MONEY.test(str(raw.symbol));
  const money = MONEY.test(symPlain) || MONEY.test(valuePlain) || MONEY.test(fracPlain) || /^(dollars?|\$)$/i.test(unitRaw);
  const unit = unitRaw && !/^(dollars?|\$)$/i.test(unitRaw) ? unitRaw : money ? "$" : undefined;

  const displayOf = (core: string, asMoney = money) => {
    const withSym = asMoney && !MONEY.test(core) ? "＄" + core : core;
    return unitRaw && !asMoney && !withSym.toLowerCase().endsWith(unitRaw.toLowerCase()) ? `${withSym} ${unitRaw}` : withSym;
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

  // "22 cupcakes", "6 years old": a number with words after it is still a number
  for (const a of [valuePlain, symPlain]) {
    const r = a ? fromNumberUnitWords(a) : null;
    if (r && checkAnswer(r.spec, a)) return { spec: r.spec, display: r.display, autoMarkable: true };
  }

  // short textual answers ("isosceles triangle", "3x + 2")
  const text = valuePlain || fracPlain || symPlain;
  if (text && NOT_TYPEABLE.test(text)) return { spec: { kind: "text", accepted: [text] }, display: text, autoMarkable: false };
  // Algebra in a money question ("cost = $5p+4$", unit ＄): the expression is dollars, keep the "＄" in what is shown.
  const textMoney = money || (legacyMoney && !!raw.moneyContext && (!unitRaw || /^[＄$]$/.test(unitRaw)));
  if (text) {
    const words = text.split(/\s+/).length;
    const isShort = text.length <= 40 && words <= 5 && !/[.!?]\s+\w/.test(text);
    // multi-value answers like "3 or 5" are text but only matched literally
    if (isShort) {
      const accepted = [text, ...text.split(/\s+or\s+/i).filter((x) => x !== text)];
      return { spec: { kind: "text", accepted }, display: displayOf(text, textMoney), autoMarkable: true };
    }
    return { spec: { kind: "text", accepted: [text] }, display: displayOf(text, textMoney), autoMarkable: false };
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
