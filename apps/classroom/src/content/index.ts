// Content access for the classroom: the SAME offline question bundle as the game (apps/mobile/assets/content, written
// only by content/), with the live editor edits (getQuestionPatches) laid over it, exactly like the game (overlay.ts).
// Every API takes `grade` (only P6 has data today).
import type { Curriculum, Grade, LevelNo, Question, QuestionBundle, SubtopicNode, TopicMap } from "@p6/shared";
import { levelIdsFrom, questionFrom, type PatchMap, type Source } from "./overlay";
import { useQuestionPatches } from "./patchStore";

/* eslint-disable @typescript-eslint/no-require-imports */
const BUNDLES: Partial<Record<Grade, { bundle: QuestionBundle; curriculum: Curriculum }>> = {
  P6: {
    bundle: require("../../../mobile/assets/content/P6/questions.json") as QuestionBundle,
    curriculum: require("../../../mobile/assets/content/P6/curriculum.json") as Curriculum,
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */

export const availableGrades = Object.keys(BUNDLES) as Grade[];
export const hasContent = (grade: Grade) => grade in BUNDLES;

function contentFor(grade: Grade) {
  const c = BUNDLES[grade];
  if (!c) throw new Error(`No content bundle for grade ${grade}`);
  return c;
}

export const getCurriculum = (grade: Grade): Curriculum => contentFor(grade).curriculum;
export const getContentVersion = (grade: Grade): string => contentFor(grade).bundle.version;
export const getTopics = (grade: Grade): TopicMap[] => [...getCurriculum(grade).topics].sort((a, b) => a.order - b.order);
export const getTopic = (grade: Grade, topicId: string): TopicMap | undefined => getCurriculum(grade).topics.find((t) => t.id === topicId);

export function getSubtopic(grade: Grade, subtopicId: string): { topic: TopicMap; subtopic: SubtopicNode } | undefined {
  for (const topic of getCurriculum(grade).topics) {
    const subtopic = topic.subtopics.find((s) => s.id === subtopicId);
    if (subtopic) return { topic, subtopic };
  }
  return undefined;
}

const NO_PATCHES: PatchMap = {};
/** The live edits for the running bundle (another bundle version's are ignored: that bundle already has them). */
export function getPatches(grade: Grade): PatchMap {
  if (!hasContent(grade)) return NO_PATCHES;
  const g = useQuestionPatches.getState().grades[grade];
  return g && g.bundleVersion === getContentVersion(grade) ? g.byId : NO_PATCHES;
}

function source(grade: Grade): Source {
  const c = contentFor(grade);
  return { questions: c.bundle.questions, topics: c.curriculum.topics, patches: getPatches(grade) };
}

/** The question as the editor has it now (patched); undefined when unknown or retired. */
export function getQuestion(grade: Grade, id: string): Question | undefined {
  return hasContent(grade) ? questionFrom(source(grade), id) : undefined;
}

/** A level's ids without retired questions, and how many slots it had (same rule as the server's activeLevelIds). */
export function getLevelIds(grade: Grade, subtopicId: string, level: LevelNo): { ids: string[]; total: number } {
  const found = getSubtopic(grade, subtopicId);
  return found ? levelIdsFrom(source(grade), found.subtopic.main[level]) : { ids: [], total: 0 };
}

/** Every LV1 auto-marked question (main path + pool), optionally for one topic (the mocks use it). */
export function getAllLv1(grade: Grade, topicId?: string): Question[] {
  const ids: string[] = [];
  for (const topic of getCurriculum(grade).topics) {
    if (topicId && topic.id !== topicId) continue;
    for (const s of topic.subtopics) ids.push(...s.main[1], ...s.pool);
  }
  return [...new Set(ids)].map((id) => getQuestion(grade, id)).filter((q): q is Question => !!q && q.difficulty === "LV1" && q.autoMarkable);
}

/** A figure the editor changed after the bundle was built (shown from its URL). */
export function getPatchFigureUrl(grade: Grade, questionId: string): string | undefined {
  const p = getPatches(grade)[questionId];
  return p?.question ? p.figureUrl : undefined;
}
