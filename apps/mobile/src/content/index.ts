// Content access layer. Screens NEVER import the generated JSON/registry directly: use these helpers.
// Every API takes `grade` (only P6 has data today; P4/P5 drop in as new bundles in assets/content/).
import type { Curriculum, Grade, LevelNo, Question, QuestionPatch, SubtopicNode, TopicMap } from "@p6/shared";
import { availableGrades, contentFor, hasContent } from "../../assets/content";
import type { FigureImage } from "./figpack";
import { allLv1From, levelIdsFrom, levelQuestionsFrom, poolFrom, questionFrom, unlockCandidatesFrom, unlockQuestionFrom, type PatchMap, type PoolFilter, type Source } from "./overlay";
import { retiredIds } from "../logic/patches";
import { useQuestionPatches } from "../store/questionPatches";

export { hasContent };

export function getCurriculum(grade: Grade): Curriculum {
  return contentFor(grade).curriculum;
}

export function getContentVersion(grade: Grade): string {
  return contentFor(grade).bundle.version;
}

export function getTopics(grade: Grade): TopicMap[] {
  return [...getCurriculum(grade).topics].sort((a, b) => a.order - b.order);
}

export function getTopic(grade: Grade, topicId: string): TopicMap | undefined {
  return getCurriculum(grade).topics.find((t) => t.id === topicId);
}

export function getSubtopic(grade: Grade, subtopicId: string): { topic: TopicMap; subtopic: SubtopicNode } | undefined {
  for (const topic of getCurriculum(grade).topics) {
    const subtopic = topic.subtopics.find((s) => s.id === subtopicId);
    if (subtopic) return { topic, subtopic };
  }
  return undefined;
}

const NO_PATCHES: PatchMap = {};

/** The live edits for the running bundle (a stored copy of another bundle version is ignored: the bundle has those edits). */
export function getPatches(grade: Grade): PatchMap {
  const g = useQuestionPatches.getState().grades[grade];
  return g && g.bundleVersion === getContentVersion(grade) ? g.byId : NO_PATCHES;
}

function source(grade: Grade): Source {
  const c = contentFor(grade);
  return { questions: c.bundle.questions, topics: c.curriculum.topics, patches: getPatches(grade) };
}

/** The question as the editor has it now (patched), undefined when unknown or retired. */
export function getQuestion(grade: Grade, id: string): Question | undefined {
  return questionFrom(source(grade), id);
}

/** Questions the editor retired since the bundle was built (never shown, not needed to complete a level). */
let retiredFor: { patches: PatchMap; set: Set<string> } | null = null;
export function getRetiredIds(grade: Grade): Set<string> {
  const patches = getPatches(grade);
  if (retiredFor?.patches !== patches) retiredFor = { patches, set: retiredIds(patches) };
  return retiredFor.set;
}

/**
 * The ids a level plays and completes with: the bundle's list minus retired questions (activeLevelIds, as on the
 * server), and `total` = the slots it had (the 5-star row keeps that many stars; a retired slot shows filled).
 */
export function getLevelIds(grade: Grade, subtopicId: string, level: LevelNo): { ids: string[]; total: number } {
  const found = getSubtopic(grade, subtopicId);
  return found ? levelIdsFrom(source(grade), found.subtopic.main[level]) : { ids: [], total: 0 };
}

/** The main-path questions for a level, patched, without retired ones (may be fewer than 5). */
export function getLevelQuestions(grade: Grade, subtopicId: string, level: LevelNo): Question[] {
  return levelQuestionsFrom(source(grade), getSubtopic(grade, subtopicId)?.subtopic, level);
}

export type { PoolFilter };

/** Classroom / mini-game pool (everything not on the main path), patched, without retired ones. */
export function getPool(grade: Grade, filter: PoolFilter = {}): Question[] {
  return poolFrom(source(grade), filter);
}

/** Timed mini game: every LV1 question (main path + pool), optionally for one topic. */
export function getAllLv1(grade: Grade, topicId?: string): Question[] {
  return allLv1From(source(grade), topicId);
}

/** One random basic MCQ for the "Find the key" modal. */
export function getUnlockQuestion(grade: Grade, topicId: string, rand: () => number = Math.random): Question | undefined {
  return unlockQuestionFrom(source(grade), getTopic(grade, topicId), rand);
}

/** Every usable key question of a topic (for keeping the chosen one stable, see logic/keyQuestion.ts). */
export function getUnlockCandidates(grade: Grade, topicId: string): Question[] {
  return unlockCandidatesFrom(source(grade), getTopic(grade, topicId));
}

/** The remote image of a question whose figure changed after the bundle was built (cached on the device). */
export function getPatchFigureUrl(grade: Grade, questionId: string): string | undefined {
  const p: QuestionPatch | undefined = getPatches(grade)[questionId];
  return p?.question ? p.figureUrl : undefined;
}

/**
 * Sync lookup of a question figure: the image when it is ready (bundled, or already extracted from the figure packs),
 * else undefined. Screens use useFigure() so they re-render once the first-time extraction (offline, ~tens of ms) is done.
 */
export function getFigure(grade: Grade, figureKey: string | undefined): FigureImage | undefined {
  return figureKey ? contentFor(grade).figures[figureKey] : undefined;
}

/** Extracts the figure from its pack if needed (no network). Resolves undefined for an unknown figure. */
export async function ensureFigure(grade: Grade, figureKey: string | undefined): Promise<FigureImage | undefined> {
  if (!figureKey) return undefined;
  const ready = getFigure(grade, figureKey);
  if (ready) return ready;
  return contentFor(grade).figureStore?.ensure(figureKey);
}

/** Background: extract every figure of every grade so later questions show instantly. Cheap after the first run. */
export async function prefetchAllFigures(): Promise<void> {
  for (const g of availableGrades) await contentFor(g).figureStore?.ensureAll();
}
