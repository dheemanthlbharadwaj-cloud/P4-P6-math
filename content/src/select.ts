// Deterministic 5/5/5 selection + curriculum assembly.
import { QUESTIONS_PER_LEVEL, type Curriculum, type Grade, type LevelNo, type Question, type SubtopicNode, type TopicMap } from "@p6/shared";
import { CANONICAL_TOPICS } from "./source";
import { slugify } from "./paths";
import { richToPlain } from "./tokenizer";

export interface SelCandidate {
  q: Question;
  verified: boolean;
  hasError: boolean;
  school: string;
}
export interface SubtopicDef { id: string; topic: string; name: string }

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isMulti = (q: Question) => (q.parts?.length ?? 0) > 1;
const LEVEL_DIFF: Record<LevelNo, string> = { 1: "LV1", 2: "LV2", 3: "LV3" };

/** Pick up to `n` for one level. Greedy: base score (verified, single-part) + diversity penalty (same year/school already picked). */
export function pickLevel(cands: SelCandidate[], level: LevelNo, n = QUESTIONS_PER_LEVEL): SelCandidate[] {
  const pool = cands
    .filter((c) => !c.hasError && c.q.autoMarkable && c.q.difficulty === LEVEL_DIFF[level])
    .sort((a, b) => cmp(a.q.id, b.q.id));
  const base = (c: SelCandidate) => (c.verified ? 0 : 50) + (level < 3 && isMulti(c.q) ? 20 : 0);
  const picked: SelCandidate[] = [];
  const remaining = [...pool];
  while (picked.length < n && remaining.length) {
    let best = -1, bestScore = Infinity;
    remaining.forEach((c, i) => {
      const sameYear = picked.filter((p) => p.q.year === c.q.year).length;
      const sameSchool = c.school ? picked.filter((p) => p.school === c.school).length : 0;
      const score = base(c) + 5 * sameYear + 5 * sameSchool;
      // strict < keeps the earliest id on ties (pool is id-sorted)
      if (score < bestScore) { bestScore = score; best = i; }
    });
    picked.push(remaining.splice(best, 1)[0]);
  }
  return picked;
}

export function buildSubtopicNode(def: SubtopicDef, order: number, cands: SelCandidate[]): SubtopicNode {
  const main: SubtopicNode["main"] = { 1: [], 2: [], 3: [] };
  const used = new Set<string>();
  const shortfall: SubtopicNode["shortfall"] = {};
  for (const lv of [1, 2, 3] as LevelNo[]) {
    const got = pickLevel(cands, lv);
    main[lv] = got.map((c) => c.q.id);
    got.forEach((c) => used.add(c.q.id));
    if (got.length < QUESTIONS_PER_LEVEL) shortfall[lv] = QUESTIONS_PER_LEVEL - got.length;
  }
  const pool = cands
    .filter((c) => !c.hasError && !used.has(c.q.id))
    .map((c) => c.q.id)
    .sort(cmp);
  const node: SubtopicNode = { id: def.id, name: def.name, order, main, pool };
  if (Object.keys(shortfall).length) node.shortfall = shortfall;
  return node;
}

/** Up to `limit` basic LV1 MCQ ids not in the topic's main set; no-figure and shortest stems first. */
export function buildUnlockPool(cands: SelCandidate[], mainIds: Set<string>, limit = 20): string[] {
  return cands
    .filter((c) => !c.hasError && c.q.autoMarkable && c.q.type === "mcq" && c.q.difficulty === "LV1" && !mainIds.has(c.q.id))
    .map((c) => ({ id: c.q.id, fig: c.q.figure ? 1 : 0, len: richToPlain(c.q.stem).length }))
    .sort((a, b) => a.fig - b.fig || a.len - b.len || cmp(a.id, b.id))
    .slice(0, limit)
    .map((x) => x.id);
}

export function subtopicId(grade: Grade, topic: string, subtopic: string): string {
  return `${grade.toLowerCase()}-${slugify(topic)}-${slugify(subtopic)}`;
}

export interface CurriculumInput {
  grade: Grade;
  version: string;
  subtopics: SubtopicDef[]; // in desired order within topic
  candidates: SelCandidate[]; // has error ones may be included; they are filtered
}

export function buildCurriculum(inp: CurriculumInput): Curriculum {
  const known = new Set(CANONICAL_TOPICS);
  const topicNames = [...CANONICAL_TOPICS, ...[...new Set(inp.subtopics.map((s) => s.topic))].filter((t) => !known.has(t)).sort()];
  const topics: TopicMap[] = [];
  for (const name of topicNames) {
    const defs = inp.subtopics.filter((s) => s.topic === name);
    if (!defs.length) continue;
    const subtopics = defs.map((def, i) => buildSubtopicNode(def, i + 1, inp.candidates.filter((c) => c.q.subtopicId === def.id)));
    const mainIds = new Set(subtopics.flatMap((s) => [...s.main[1], ...s.main[2], ...s.main[3]]));
    const topicCands = inp.candidates.filter((c) => c.q.topic === name);
    topics.push({
      id: slugify(name),
      name,
      order: topics.length + 1,
      subtopics,
      unlockPool: buildUnlockPool(topicCands, mainIds),
    });
  }
  return { grade: inp.grade, version: inp.version, topics };
}
