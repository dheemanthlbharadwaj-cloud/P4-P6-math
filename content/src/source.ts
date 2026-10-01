// Source (editor bank) docs → normalized records + Question conversion.
import fs from "node:fs";
import {
  type AnswerPart,
  type Difficulty,
  type Grade,
  type Paper,
  type Question,
} from "@p6/shared";
import { extractSpec, plainAnswer, splitLetteredAnswer } from "./answerSpec";
import { mappingPath, snapshotPath } from "./paths";
import { newStats, tokenize, type TokenizeStats } from "./tokenizer";

export const CANONICAL_TOPICS = [
  "Algebra",
  "Angles in Geometric Figures",
  "Area and Perimeter",
  "Arithmetic",
  "Circles",
  "Data Representation",
  "Drawing",
  "Fractions",
  "Percentage",
  "Rate",
  "Ratio",
  "Solid Figures and Nets",
  "Volume of Solids and Liquids",
];

export const SUBTOPIC_FIELD_CANDIDATES = [
  "subtopic",
  "subtopic_primary",
  "subtopics",
  "subtopic_primaries",
  "sub_topic",
  "sub_topics",
  "subTopic",
  "subtopic_name",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawDoc = Record<string, any> & { id: string };

export interface Snapshot {
  grade?: string;
  project?: string;
  fetchedAt?: string;
  count?: number;
  questions: RawDoc[];
}

export function loadSnapshot(grade: Grade, file = snapshotPath(grade)): Snapshot {
  if (!fs.existsSync(file)) throw new Error(`Snapshot not found: ${file}\nRun: npm run sync -w @p6/content -- --grade ${grade}`);
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(j) ? { questions: j } : j;
}

// ---------- mapping override ----------
export interface MappingRow { topic: string; subtopic: string }
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
export function loadMapping(grade: Grade, file = mappingPath(grade)): Map<string, MappingRow> | null {
  if (!fs.existsSync(file)) return null;
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const [head, ...body] = rows;
  const ix = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n);
  const [iq, it, is] = [ix("question_id"), ix("topic"), ix("subtopic")];
  if (iq < 0 || it < 0 || is < 0) throw new Error(`${file}: header must be question_id,topic,subtopic`);
  const m = new Map<string, MappingRow>();
  for (const r of body) m.set(r[iq].trim(), { topic: r[it].trim(), subtopic: r[is].trim() });
  return m;
}

// ---------- subtopic field detection ----------
const first = (v: unknown): string => {
  if (Array.isArray(v)) return v.length ? first(v[0]) : "";
  if (v && typeof v === "object") return "";
  return v == null ? "" : String(v).trim();
};

export interface FieldDetection {
  field: string | null;
  candidates: { field: string; coverage: number; distinct: number }[];
}
/** Pick the field that holds the subtopic: explicit candidates first, otherwise any key containing "subtopic". */
export function detectSubtopicField(docs: RawDoc[], forced?: string): FieldDetection {
  const keys = new Set<string>();
  for (const d of docs) for (const k of Object.keys(d)) if (/sub[_-]?topic/i.test(k)) keys.add(k);
  const names = [...new Set([...(forced ? [forced] : []), ...SUBTOPIC_FIELD_CANDIDATES, ...keys])];
  const candidates = names
    .map((field) => {
      const vals = docs.map((d) => first(d[field])).filter(Boolean);
      return { field, coverage: vals.length, distinct: new Set(vals).size };
    })
    .filter((c) => c.coverage > 0);
  if (forced && candidates.some((c) => c.field === forced)) return { field: forced, candidates };
  // first candidate in priority order with coverage ≥ half of docs, else most coverage
  const half = docs.length / 2;
  const pick = candidates.find((c) => c.coverage >= half) ?? [...candidates].sort((a, b) => b.coverage - a.coverage)[0];
  return { field: pick?.field ?? null, candidates };
}

// ---------- normalized view ----------
export interface NormDoc {
  id: string;
  raw: RawDoc;
  topic: string; // as found (may be non-canonical)
  subtopic: string;
  difficulty: Difficulty | null;
  hasError: boolean;
  verified: boolean;
  school: string;
  year: number;
  fromMapping: boolean;
  /** Editor curriculum (chapters = maps). Absent in older banks → topics are used as maps. */
  chapter: string | null;
  chapterNo: number | null;
  excluded: boolean;
  /** Editor's own 5/5/5 pick: rank 1..5 within (subtopic, difficulty) when `selected`. */
  selectedRank: number | null;
}

export function schoolOf(d: RawDoc): string {
  if (typeof d.school === "string" && d.school) return d.school;
  const seg = String(d.id).split("_");
  return seg.length >= 3 ? seg[1] : "";
}

export function normalizeDocs(docs: RawDoc[], opts: { subtopicField?: string | null; mapping?: Map<string, MappingRow> | null } = {}): NormDoc[] {
  return docs.map((d) => {
    const map = opts.mapping?.get(d.id);
    const diff = String(d.difficulty ?? "").toUpperCase();
    const year = Number(d.year) || Number(String(d.id).slice(0, 4)) || 0;
    return {
      id: d.id,
      raw: d,
      topic: map?.topic || first(d.topic_primary) || first(d.topic) || first(d.topics),
      subtopic: map?.subtopic || (opts.subtopicField ? first(d[opts.subtopicField]) : ""),
      difficulty: diff === "LV1" || diff === "LV2" || diff === "LV3" ? (diff as Difficulty) : null,
      hasError: d.has_error === true || d.has_error === "true",
      verified: d.verified === true || d.verified === "true",
      school: schoolOf(d),
      year,
      fromMapping: !!map,
      chapter: typeof d.chapter === "string" && d.chapter ? d.chapter : null,
      chapterNo: Number.isFinite(Number(d.chapter_no)) && d.chapter_no !== null && d.chapter_no !== "" ? Number(d.chapter_no) : null,
      excluded: d.excluded === true || d.excluded === "true",
      selectedRank: (d.selected === true || d.selected === "true") && Number(d.selected_rank) > 0 ? Number(d.selected_rank) : null,
    };
  });
}

// ---------- conversion ----------
const PAPERS: Paper[] = ["Paper 1 Booklet A", "Paper 1 Booklet B", "Paper 2"];
function toPaper(p: unknown, type: "mcq" | "open", diff: Difficulty | null): Paper {
  const s = String(p ?? "").toLowerCase();
  if (s.includes("booklet a") || s === "1a") return PAPERS[0];
  if (s.includes("booklet b") || s === "1b") return PAPERS[1];
  if (s.includes("2")) return PAPERS[2];
  return type === "mcq" || diff === "LV1" ? PAPERS[0] : PAPERS[1];
}

export interface ConvertCtx {
  grade: Grade;
  subtopicId: string;
  stats: TokenizeStats;
  hasFigure: boolean;
}
export interface Converted {
  question: Question;
  reasons: string[]; // why it is not auto-markable
}

const OPT_KEYS = ["1", "2", "3", "4"] as const;
function optionKey(v: unknown): "1" | "2" | "3" | "4" | undefined {
  const s = String(v ?? "").trim().toUpperCase();
  if (/^[1-4]$/.test(s)) return s as "1" | "2" | "3" | "4";
  if (/^[A-D]$/.test(s)) return String("ABCD".indexOf(s) + 1) as "1" | "2" | "3" | "4";
  return undefined;
}

export function convertQuestion(n: NormDoc, topicCanonical: string, ctx: ConvertCtx): Converted {
  const d = n.raw;
  const reasons: string[] = [];
  const isMcq = d.question_type === "mcq" || (d.options && typeof d.options === "object" && Object.keys(d.options).length >= 2);
  const type: "mcq" | "open" = isMcq ? "mcq" : "open";
  const paper = toPaper(d.paper, type, n.difficulty);
  const q: Question = {
    id: n.id,
    grade: ctx.grade,
    year: n.year,
    topic: topicCanonical,
    topics: Array.isArray(d.topics) ? d.topics.map(String) : [topicCanonical],
    subtopicId: ctx.subtopicId,
    difficulty: n.difficulty ?? "LV1",
    type,
    paper,
    calculatorAllowed: typeof d.calculator_allowed === "boolean" ? d.calculator_allowed : paper === "Paper 2",
    stem: tokenize(d.question, ctx.stats),
    autoMarkable: true,
  };
  if (ctx.hasFigure) q.figure = n.id;

  if (type === "mcq") {
    q.options = [];
    for (const k of OPT_KEYS) {
      const t = d.options?.[k];
      if (t != null && String(t).trim() !== "") q.options.push({ key: k, text: tokenize(String(t), ctx.stats) });
    }
    const key = optionKey(d.answer_key);
    if (!key || !q.options.some((o) => o.key === key)) reasons.push("mcq: missing/invalid answer_key");
    else q.correctOption = key;
    if (q.options.length < 2) reasons.push("mcq: fewer than 2 options");
  } else {
    const parts: AnswerPart[] = [];
    const qp: { part: string; text: string }[] = Array.isArray(d.question_parts)
      ? d.question_parts.map((p: { part?: unknown; text?: unknown }) => ({ part: String(p.part ?? "").replace(/[()]/g, ""), text: String(p.text ?? "") }))
      : [];
    const labelFor = (part: string) => {
      const m = qp.find((p) => p.part === part);
      return m ? { label: tokenize(m.text, ctx.stats) } : {};
    };
    if (Array.isArray(d.answer_parts) && d.answer_parts.length) {
      for (const ap of d.answer_parts) {
        const part = String(ap.part ?? "").replace(/[()]/g, "");
        const r = extractSpec({ value: ap.value ?? ap.answer, fraction: ap.fraction ?? ap.answer_fraction, symbol: ap.symbol, unit: ap.unit }, ctx.stats);
        if (!r.autoMarkable) reasons.push(`part ${part || "?"}: unparsable answer`);
        parts.push({ part, ...labelFor(part), answer: r.spec, display: r.display });
      }
    } else if (qp.length > 1) {
      const split = splitLetteredAnswer(plainAnswer(d.answer, ctx.stats));
      if (split && split.length === qp.length) {
        for (const s of split) {
          const r = extractSpec({ value: s.value, unit: d.unit }, ctx.stats);
          if (!r.autoMarkable) reasons.push(`part ${s.part}: unparsable answer`);
          parts.push({ part: s.part, ...labelFor(s.part), answer: r.spec, display: r.display });
        }
      } else {
        reasons.push("multi-part question without answer_parts");
        const r = extractSpec({ value: d.answer }, ctx.stats);
        parts.push({ part: "", answer: r.spec, display: r.display });
      }
    } else {
      const r = extractSpec({ value: d.answer, fraction: d.answer_fraction, symbol: d.answer_symbol, unit: d.unit }, ctx.stats);
      if (!r.autoMarkable) reasons.push(r.display ? "answer is an explanation / not parsable" : "missing answer");
      parts.push({ part: "", answer: r.spec, display: r.display });
    }
    q.parts = parts;
  }
  if (topicCanonical === "Drawing") reasons.push("Drawing task");
  if (reasons.length) q.autoMarkable = false;
  return { question: q, reasons };
}

export const levelOf = (d: Difficulty): 1 | 2 | 3 => Number(d.slice(2)) as 1 | 2 | 3;

export { newStats };
