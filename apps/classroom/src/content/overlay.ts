// Pure overlay of live question edits (patches) on the bundle. Everything the app decides about "which questions" goes
// through here: a patched question replaces the bundled one, a retired one (patch.question === null) is left out of
// pools, mini games, practice, key questions and levels (levels use activeLevelIds, like the server).
import type { LevelNo, Question, QuestionPatch, SubtopicNode, TopicMap } from "@p6/shared";
import { activeLevelIds, LEVEL_DIFFICULTY } from "@p6/shared";
import { retiredIds } from "../logic/patches";

export type PatchMap = Record<string, QuestionPatch>;

export interface Source {
  questions: Record<string, Question>;
  topics: readonly TopicMap[];
  patches: PatchMap;
}

export interface PoolFilter {
  topicId?: string;
  subtopicId?: string;
  level?: LevelNo;
  autoMarkableOnly?: boolean;
}

/** The question as it is now; undefined when unknown or retired. */
export function questionFrom(src: Source, id: string): Question | undefined {
  const p = src.patches[id];
  if (p) return p.question ?? undefined;
  return src.questions[id];
}

function resolve(src: Source, ids: readonly string[]): Question[] {
  const out: Question[] = [];
  for (const id of ids) {
    const q = questionFrom(src, id);
    if (q) out.push(q);
  }
  return out;
}

/** A level's playable ids (retired ones removed, never empty) and how many slots it had in the bundle. */
export function levelIdsFrom(src: Source, main: readonly string[]): { ids: string[]; total: number } {
  return { ids: activeLevelIds(main, retiredIds(src.patches)), total: main.length };
}

export function levelQuestionsFrom(src: Source, subtopic: SubtopicNode | undefined, level: LevelNo): Question[] {
  if (!subtopic) return [];
  const out: Question[] = [];
  for (const id of levelIdsFrom(src, subtopic.main[level]).ids) {
    // (a level whose every question was retired keeps its original list: then the bundled question is shown)
    const q = questionFrom(src, id) ?? src.questions[id];
    if (q) out.push(q);
  }
  return out;
}

export function poolFrom(src: Source, filter: PoolFilter = {}): Question[] {
  const ids: string[] = [];
  for (const topic of src.topics) {
    if (filter.topicId && topic.id !== filter.topicId) continue;
    for (const s of topic.subtopics) {
      if (filter.subtopicId && s.id !== filter.subtopicId) continue;
      ids.push(...s.pool);
    }
  }
  let qs = resolve(src, ids);
  if (filter.level) qs = qs.filter((q) => q.difficulty === LEVEL_DIFFICULTY[filter.level!]);
  if (filter.autoMarkableOnly) qs = qs.filter((q) => q.autoMarkable);
  return qs;
}

export function allLv1From(src: Source, topicId?: string): Question[] {
  const ids: string[] = [];
  for (const topic of src.topics) {
    if (topicId && topic.id !== topicId) continue;
    // (a fully retired level 1 keeps showing nothing here: its questions are retired)
    for (const s of topic.subtopics) ids.push(...s.main[1], ...s.pool);
  }
  return resolve(src, [...new Set(ids)]).filter((q) => q.difficulty === "LV1" && q.autoMarkable);
}

/** The topic's usable "Find the key" questions (patched, not retired, auto-marked MCQs). */
export function unlockCandidatesFrom(src: Source, topic: TopicMap | undefined): Question[] {
  return topic ? resolve(src, topic.unlockPool).filter((q) => q.type === "mcq" && q.autoMarkable) : [];
}

export function unlockQuestionFrom(src: Source, topic: TopicMap | undefined, rand: () => number = Math.random): Question | undefined {
  const mcqs = unlockCandidatesFrom(src, topic);
  return mcqs.length ? mcqs[Math.floor(rand() * mcqs.length)] : undefined;
}
