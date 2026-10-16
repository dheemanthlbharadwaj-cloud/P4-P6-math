// Deterministic 5/5/5 selection + curriculum assembly.
import { QUESTIONS_PER_LEVEL, type Curriculum, type Grade, type LevelNo, type Question, type SubtopicNode, type TopicMap } from "@p6/shared";
import { CANONICAL_TOPICS } from "./source";
import { slugify } from "./paths";
import { richToPlain } from "./tokenizer";
import { SUBTOPIC_RULES, allowedInSubtopic, showsPreferredIntent } from "./subtopicRules";

export interface SelCandidate {
  q: Question;
  verified: boolean;
  hasError: boolean;
  school: string;
  selectedRank?: number | null; // editor's own 5/5/5 pick
}
/** `topic` is the map the node sits on: the editor chapter when present, else the canonical topic. */
export interface SubtopicDef { id: string; topic: string; name: string; topicOrder?: number }

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isMulti = (q: Question) => (q.parts?.length ?? 0) > 1;
const LEVEL_DIFF: Record<LevelNo, string> = { 1: "LV1", 2: "LV2", 3: "LV3" };

/** Pick up to `n` for one level. Greedy: base score (verified, single-part) + diversity penalty (same year/school already picked). */
export function pickLevel(cands: SelCandidate[], level: LevelNo, n = QUESTIONS_PER_LEVEL, fromLevel: LevelNo = level): SelCandidate[] {
  const pool = cands
    .filter((c) => !c.hasError && c.q.autoMarkable && c.q.difficulty === LEVEL_DIFF[fromLevel])
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

/** A level that was filled from another difficulty because the subtopic's rule left too few questions (reported by the build). */
export interface SelectionNote { subtopicId: string; level: LevelNo; id: string; fromDifficulty: string }

/** Candidates the subtopic's rule (subtopicRules.ts) allows; all of them for subtopics without a rule. */
export function applyRule(subtopicId: string, cands: SelCandidate[]): SelCandidate[] {
  return SUBTOPIC_RULES[subtopicId] ? cands.filter((c) => allowedInSubtopic(c.q)) : cands;
}

/** Other levels by closeness (ties: the easier one first). */
const NEAREST: Record<LevelNo, LevelNo[]> = { 1: [2, 3], 2: [1, 3], 3: [2, 1] };

/** Editor picks first (by rank), then the scorer; only among `ok` candidates of difficulty `from`, none already used. */
function pickTier(cands: SelCandidate[], used: Set<string>, level: LevelNo, from: LevelNo, n: number, ok: (c: SelCandidate) => boolean): SelCandidate[] {
  if (n <= 0) return [];
  const free = cands.filter((c) => ok(c) && !used.has(c.q.id));
  const chosen = free
    .filter((c) => c.selectedRank && c.q.difficulty === LEVEL_DIFF[from] && !c.hasError && c.q.autoMarkable)
    .sort((a, b) => a.selectedRank! - b.selectedRank! || cmp(a.q.id, b.q.id))
    .slice(0, n);
  const ids = new Set(chosen.map((c) => c.q.id));
  return [...chosen, ...pickLevel(free.filter((c) => !ids.has(c.q.id)), level, n - chosen.length, from)];
}

/**
 * Main levels of a subtopic with a rule that prefers some content. Order of use, each step only for levels still short:
 * 1. the level's own difficulty, preferred content;  2. preferred content of the nearest difficulty (hardest level first,
 * so the leftover harder add/subtract questions go to the level with the fewest);  3. own difficulty, other content;
 * 4. other content of the nearest difficulty. Steps 2 and 4 are reported in `notes`.
 */
function buildPreferredMain(def: SubtopicDef, cands: SelCandidate[], notes?: SelectionNote[]): SubtopicNode["main"] {
  const rule = SUBTOPIC_RULES[def.id];
  const pref = (c: SelCandidate) => showsPreferredIntent(c.q, rule);
  const other = (c: SelCandidate) => !pref(c);
  const used = new Set<string>();
  const got: Record<LevelNo, SelCandidate[]> = { 1: [], 2: [], 3: [] };
  const take = (lv: LevelNo, from: LevelNo, ok: (c: SelCandidate) => boolean) => {
    const add = pickTier(cands, used, lv, from, QUESTIONS_PER_LEVEL - got[lv].length, ok);
    for (const c of add) { used.add(c.q.id); got[lv].push(c); if (from !== lv) notes?.push({ subtopicId: def.id, level: lv, id: c.q.id, fromDifficulty: LEVEL_DIFF[from] }); }
  };
  const fill = !!rule.fillFromNearestDifficulty;
  for (const lv of [1, 2, 3] as LevelNo[]) take(lv, lv, pref);
  if (fill) for (const lv of [3, 2, 1] as LevelNo[]) for (const from of NEAREST[lv]) take(lv, from, pref);
  for (const lv of [1, 2, 3] as LevelNo[]) take(lv, lv, other);
  if (fill) for (const lv of [3, 2, 1] as LevelNo[]) for (const from of NEAREST[lv]) take(lv, from, other);
  return { 1: got[1].map((c) => c.q.id), 2: got[2].map((c) => c.q.id), 3: got[3].map((c) => c.q.id) };
}

export function buildSubtopicNode(def: SubtopicDef, order: number, allCands: SelCandidate[], notes?: SelectionNote[]): SubtopicNode {
  const cands = applyRule(def.id, allCands);
  const fill = !!SUBTOPIC_RULES[def.id]?.fillFromNearestDifficulty;
  let main: SubtopicNode["main"] = { 1: [], 2: [], 3: [] };
  const used = new Set<string>();
  const shortfall: SubtopicNode["shortfall"] = {};
  const preferred = !!SUBTOPIC_RULES[def.id]?.prefer;
  if (preferred) {
    main = buildPreferredMain(def, cands, notes);
    for (const lv of [1, 2, 3] as LevelNo[]) {
      main[lv].forEach((id) => used.add(id));
      if (main[lv].length < QUESTIONS_PER_LEVEL) shortfall[lv] = QUESTIONS_PER_LEVEL - main[lv].length;
    }
  }
  for (const lv of preferred ? [] : ([1, 2, 3] as LevelNo[])) {
    // The editor team's selection wins; anything unusable in it is backfilled by the scorer.
    const chosen = cands
      .filter((c) => c.selectedRank && c.q.difficulty === LEVEL_DIFF[lv] && !c.hasError && c.q.autoMarkable)
      .sort((a, b) => a.selectedRank! - b.selectedRank! || cmp(a.q.id, b.q.id))
      .slice(0, QUESTIONS_PER_LEVEL);
    const chosenIds = new Set(chosen.map((c) => c.q.id));
    const got = [...chosen, ...pickLevel(cands.filter((c) => !chosenIds.has(c.q.id) && !used.has(c.q.id)), lv, QUESTIONS_PER_LEVEL - chosen.length)];
    // Rule subtopics may borrow from the nearest difficulty instead of shrinking the level.
    for (const from of fill ? NEAREST[lv] : []) {
      if (got.length >= QUESTIONS_PER_LEVEL) break;
      const gotIds = new Set(got.map((c) => c.q.id));
      const extra = pickLevel(cands.filter((c) => !gotIds.has(c.q.id) && !used.has(c.q.id)), lv, QUESTIONS_PER_LEVEL - got.length, from);
      for (const c of extra) notes?.push({ subtopicId: def.id, level: lv, id: c.q.id, fromDifficulty: LEVEL_DIFF[from] });
      got.push(...extra);
    }
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
    .filter((c) => !SUBTOPIC_RULES[c.q.subtopicId] || allowedInSubtopic(c.q)) // subtopic rules apply here too
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
  notes?: SelectionNote[]; // out: levels filled from another difficulty (subtopic rules)
}

export function buildCurriculum(inp: CurriculumInput): Curriculum {
  const known = new Set(CANONICAL_TOPICS);
  const chapterMode = inp.subtopics.some((s) => s.topicOrder !== undefined);
  const topicNames = chapterMode
    ? [...new Map(inp.subtopics.map((s) => [s.topic, s.topicOrder ?? 999] as const))].sort((a, b) => a[1] - b[1] || cmp(a[0], b[0])).map(([t]) => t)
    : [...CANONICAL_TOPICS, ...[...new Set(inp.subtopics.map((s) => s.topic))].filter((t) => !known.has(t)).sort()];
  const topics: TopicMap[] = [];
  for (const name of topicNames) {
    const defs = inp.subtopics.filter((s) => s.topic === name);
    if (!defs.length) continue;
    const subtopics = defs.map((def, i) => buildSubtopicNode(def, i + 1, inp.candidates.filter((c) => c.q.subtopicId === def.id), inp.notes));
    const mainIds = new Set(subtopics.flatMap((s) => [...s.main[1], ...s.main[2], ...s.main[3]]));
    const nodeIds = new Set(defs.map((d) => d.id));
    const topicCands = inp.candidates.filter((c) => nodeIds.has(c.q.subtopicId));
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
