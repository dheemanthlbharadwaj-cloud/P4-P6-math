import fs from "node:fs";
import path from "node:path";
import type { Grade } from "@p6/shared";
import { assetsContentRoot, rawFiguresDir, sanitizeId } from "./paths";
import { writeOutputs, type FigureSource } from "./output";
import { buildCurriculum, subtopicId, type SelCandidate, type SubtopicDef } from "./select";
import {
  CANONICAL_TOPICS, convertQuestion, detectSubtopicField, loadMapping, loadSnapshot, newStats, normalizeDocs,
  type NormDoc, type RawDoc,
} from "./source";
import type { TokenizeStats } from "./tokenizer";

export interface Prepared {
  norm: NormDoc[];
  subtopicField: string | null;
  defs: SubtopicDef[];
  candidates: SelCandidate[];
  figures: FigureSource[];
  skipped: { id: string; reason: string }[];
  nonAutoReasons: Map<string, string[]>;
  missingFigures: string[]; // figure required (or url present) but no downloaded file
  stats: TokenizeStats;
}

export function findFigureFile(grade: Grade, id: string, figDir = rawFiguresDir(grade)): string | null {
  if (!fs.existsSync(figDir)) return null;
  const stem = sanitizeId(id);
  for (const ext of ["webp", "png", "jpg", "jpeg", "gif"]) {
    const p = path.join(figDir, `${stem}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function wantsFigure(d: RawDoc): boolean {
  return !!(d.figure_url || d.figure?.required);
}

/** Shared by audit and build: snapshot docs → candidates (all topics canonical, subtopic known, difficulty known). */
export function prepare(docs: RawDoc[], grade: Grade, o: { subtopicField?: string; mapping?: ReturnType<typeof loadMapping>; figDir?: string } = {}): Prepared {
  const mapping = o.mapping ?? null;
  const det = detectSubtopicField(docs, o.subtopicField);
  const norm = normalizeDocs(docs, { subtopicField: det.field, mapping });
  const stats = newStats();
  const skipped: Prepared["skipped"] = [];
  const known = new Set(CANONICAL_TOPICS);
  const usable = norm.filter((n) => {
    if (!known.has(n.topic)) return skipped.push({ id: n.id, reason: `non-canonical topic "${n.topic}"` }), false;
    if (!n.subtopic) return skipped.push({ id: n.id, reason: "no subtopic" }), false;
    if (!n.difficulty) return skipped.push({ id: n.id, reason: "no/invalid difficulty" }), false;
    return true;
  });
  // subtopic defs
  const pairs = new Map<string, SubtopicDef>();
  const usedIds = new Set<string>();
  for (const n of [...usable].sort((a, b) => (a.topic + "\0" + a.subtopic < b.topic + "\0" + b.subtopic ? -1 : 1))) {
    const key = n.topic + "\0" + n.subtopic;
    if (pairs.has(key)) continue;
    let id = subtopicId(grade, n.topic, n.subtopic);
    while (usedIds.has(id)) id += "-2";
    usedIds.add(id);
    pairs.set(key, { id, topic: n.topic, name: n.subtopic });
  }
  const defs = [...pairs.values()].sort((a, b) => CANONICAL_TOPICS.indexOf(a.topic) - CANONICAL_TOPICS.indexOf(b.topic) || (a.name < b.name ? -1 : 1));

  const candidates: SelCandidate[] = [];
  const figures: FigureSource[] = [];
  const missingFigures: string[] = [];
  const nonAutoReasons = new Map<string, string[]>();
  for (const n of usable) {
    const def = pairs.get(n.topic + "\0" + n.subtopic)!;
    const figFile = findFigureFile(grade, n.id, o.figDir);
    if (wantsFigure(n.raw) && !figFile) missingFigures.push(n.id);
    const { question, reasons } = convertQuestion(n, n.topic, { grade, subtopicId: def.id, stats, hasFigure: !!figFile });
    if (reasons.length) nonAutoReasons.set(n.id, reasons);
    if (figFile && !n.hasError) figures.push({ id: n.id, input: figFile });
    candidates.push({ q: question, verified: n.verified, hasError: n.hasError, school: n.school });
  }
  return { norm, subtopicField: det.field, defs, candidates, figures, skipped, nonAutoReasons, missingFigures, stats };
}

export async function runBuild(grade: Grade, opts: { subtopicField?: string; contentRoot?: string; snapshot?: string } = {}) {
  const snap = loadSnapshot(grade, opts.snapshot);
  const prep = prepare(snap.questions, grade, { subtopicField: opts.subtopicField, mapping: loadMapping(grade) });
  const kept = prep.candidates.filter((c) => !c.hasError);
  const curriculum = buildCurriculum({ grade, version: "", subtopics: prep.defs, candidates: kept });
  const res = await writeOutputs({
    grade,
    questions: kept.map((c) => c.q),
    curriculum: { grade, topics: curriculum.topics },
    figures: prep.figures,
    contentRoot: opts.contentRoot ?? assetsContentRoot(),
  });
  const short = curriculum.topics.flatMap((t) => t.subtopics.filter((s) => s.shortfall));
  return { ...res, questions: kept.length, excludedHasError: prep.candidates.length - kept.length, skipped: prep.skipped.length, subtopics: prep.defs.length, shortfallSubtopics: short.length, unknownLatex: [...prep.stats.unknownCommands.entries()] };
}
