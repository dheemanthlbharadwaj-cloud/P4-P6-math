// Editor doc → Question. PURE: no Node, sharp or fs. Used by the content pipeline (build.ts prepare) and, copied by
// backend/functions/scripts/copy-shared.mjs, by the backend (getQuestionPatches), so an edited question is converted
// exactly as the bundle would have converted it. Only imports ./answerSpec, ./tokenizer and @p6/shared.
import type { AnswerPart, Difficulty, Grade, Paper, Question } from "@p6/shared";
import { extractSpec, plainAnswer, splitLetteredAnswer } from "./answerSpec";
import { newStats, tokenize, type TokenizeStats } from "./tokenizer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EditorDoc = Record<string, any> & { id: string };

/** Drop the paper's own numbering ("6. What is…", "Q12) Find…"); "6.5 kg" is untouched (no space after the dot). */
export function stripQuestionNumber(text: string, id?: string): string {
  const out = text.replace(/^\s*(?:Q(?:uestion)?\s*)?\d{1,2}\s*[.)]\s+/, "");
  // OCR'd stems often start with the bare question number ("8 The figure…"). Only strip it when it matches the
  // question's own number (…_Q08), so a stem that really starts with a number ("8 boys…") is left alone.
  const qno = id ? /_Q0*(\d{1,2})$/.exec(id)?.[1] : undefined;
  if (qno && out === text) return text.replace(new RegExp(`^\\s*${qno}\\s+(?=[A-Z(])`), "");
  return out;
}

/** OCR reads a squared unit at the end of an MCQ option as "?" ("38.5 cm?"); an option never ends in a question mark. */
export function fixOptionUnits(text: string): string {
  return text.replace(/\b(cm|m|km|mm)\?\s*$/, "$1²");
}

const PAPERS: Paper[] = ["Paper 1 Booklet A", "Paper 1 Booklet B", "Paper 2"];
function toPaper(p: unknown, type: "mcq" | "open", diff: Difficulty | null): Paper {
  const s = String(p ?? "").toLowerCase();
  if (s.includes("booklet a") || s === "1a") return PAPERS[0];
  if (s.includes("booklet b") || s === "1b") return PAPERS[1];
  if (s.includes("2")) return PAPERS[2];
  return type === "mcq" || diff === "LV1" ? PAPERS[0] : PAPERS[1];
}

export function parseDifficulty(v: unknown): Difficulty | null {
  const diff = String(v ?? "").toUpperCase();
  return diff === "LV1" || diff === "LV2" || diff === "LV3" ? (diff as Difficulty) : null;
}

/** What the bundle already knows about the question (the doc alone cannot say). */
export interface QuestionCtx {
  grade: Grade;
  subtopicId: string;
  /** canonical topic */
  topic: string;
  /** a figure image exists for the question (sets Question.figure = id) */
  hasFigure: boolean;
  /** overrides the doc's difficulty (the patch keeps the question where the bundle put it) */
  difficulty?: Difficulty | null;
  stats?: TokenizeStats;
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

export function docToQuestion(d: EditorDoc, ctx: QuestionCtx): Converted {
  const reasons: string[] = [];
  const stats = ctx.stats ?? newStats();
  const id = d.id;
  const difficulty = ctx.difficulty !== undefined ? ctx.difficulty : parseDifficulty(d.difficulty);
  const year = Number(d.year) || Number(String(id).slice(0, 4)) || 0;
  const topicCanonical = ctx.topic;
  const isMcq = d.question_type === "mcq" || (d.options && typeof d.options === "object" && Object.keys(d.options).length >= 2);
  const type: "mcq" | "open" = isMcq ? "mcq" : "open";
  const paper = toPaper(d.paper, type, difficulty);
  const q: Question = {
    id,
    grade: ctx.grade,
    year,
    topic: topicCanonical,
    topics: Array.isArray(d.topics) ? d.topics.map(String) : [topicCanonical],
    subtopicId: ctx.subtopicId,
    difficulty: difficulty ?? "LV1",
    type,
    paper,
    calculatorAllowed: typeof d.calculator_allowed === "boolean" ? d.calculator_allowed : paper === "Paper 2",
    stem: tokenize(stripQuestionNumber(String(d.question ?? ""), id), stats),
    autoMarkable: true,
  };
  if (ctx.hasFigure) q.figure = id;

  if (type === "mcq") {
    q.options = [];
    for (const k of OPT_KEYS) {
      const t = d.options?.[k];
      if (t != null && String(t).trim() !== "") q.options.push({ key: k, text: tokenize(fixOptionUnits(String(t)), stats) });
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
      return m ? { label: tokenize(m.text, stats) } : {};
    };
    if (Array.isArray(d.answer_parts) && d.answer_parts.length) {
      for (const ap of d.answer_parts) {
        const part = String(ap.part ?? "").replace(/[()]/g, "");
        const r = extractSpec({ value: ap.value ?? ap.answer, fraction: ap.fraction ?? ap.answer_fraction, symbol: ap.symbol, unit: ap.unit }, stats);
        if (!r.autoMarkable) reasons.push(`part ${part || "?"}: unparsable answer`);
        parts.push({ part, ...labelFor(part), answer: r.spec, display: r.display });
      }
    } else if (qp.length > 1) {
      const split = splitLetteredAnswer(plainAnswer(d.answer, stats));
      if (split && split.length === qp.length) {
        for (const s of split) {
          const r = extractSpec({ value: s.value, unit: d.unit }, stats);
          if (!r.autoMarkable) reasons.push(`part ${s.part}: unparsable answer`);
          parts.push({ part: s.part, ...labelFor(s.part), answer: r.spec, display: r.display });
        }
      } else {
        reasons.push("multi-part question without answer_parts");
        const r = extractSpec({ value: d.answer }, stats);
        parts.push({ part: "", answer: r.spec, display: r.display });
      }
    } else {
      const r = extractSpec({ value: d.answer, fraction: d.answer_fraction, symbol: d.answer_symbol, unit: d.unit }, stats);
      if (!r.autoMarkable) reasons.push(r.display ? "answer is an explanation / not parsable" : "missing answer");
      parts.push({ part: "", answer: r.spec, display: r.display });
    }
    q.parts = parts;
  }
  if (topicCanonical === "Drawing") reasons.push("Drawing task");
  if (reasons.length) q.autoMarkable = false;
  return { question: q, reasons };
}
