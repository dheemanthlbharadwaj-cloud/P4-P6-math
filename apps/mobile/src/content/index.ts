// Content access layer. Screens NEVER import the generated JSON/registry directly: use these helpers.
// Every API takes `grade` (only P6 has data today; P4/P5 drop in as new bundles in assets/content/).
import type { Curriculum, Grade, LevelNo, Question, SubtopicNode, TopicMap } from "@p6/shared";
import { LEVEL_DIFFICULTY } from "@p6/shared";
import { contentFor, hasContent } from "../../assets/content";

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

export function getQuestion(grade: Grade, id: string): Question | undefined {
  return contentFor(grade).bundle.questions[id];
}

function resolve(grade: Grade, ids: string[]): Question[] {
  const out: Question[] = [];
  for (const id of ids) {
    const q = getQuestion(grade, id);
    if (q) out.push(q);
  }
  return out;
}

/** The 5 main-path questions for a level (may be fewer when the audit reported a shortfall). */
export function getLevelQuestions(grade: Grade, subtopicId: string, level: LevelNo): Question[] {
  const found = getSubtopic(grade, subtopicId);
  return found ? resolve(grade, found.subtopic.main[level]) : [];
}

export interface PoolFilter {
  topicId?: string;
  subtopicId?: string;
  level?: LevelNo;
  autoMarkableOnly?: boolean;
}

/** Classroom / mini-game pool (everything not on the main path). */
export function getPool(grade: Grade, filter: PoolFilter = {}): Question[] {
  const ids: string[] = [];
  for (const topic of getCurriculum(grade).topics) {
    if (filter.topicId && topic.id !== filter.topicId) continue;
    for (const s of topic.subtopics) {
      if (filter.subtopicId && s.id !== filter.subtopicId) continue;
      ids.push(...s.pool);
    }
  }
  let qs = resolve(grade, ids);
  if (filter.level) qs = qs.filter((q) => q.difficulty === LEVEL_DIFFICULTY[filter.level!]);
  if (filter.autoMarkableOnly) qs = qs.filter((q) => q.autoMarkable);
  return qs;
}

/** Timed mini game: every LV1 question (main path + pool), optionally for one topic. */
export function getAllLv1(grade: Grade, topicId?: string): Question[] {
  const ids: string[] = [];
  for (const topic of getCurriculum(grade).topics) {
    if (topicId && topic.id !== topicId) continue;
    for (const s of topic.subtopics) ids.push(...s.main[1], ...s.pool);
  }
  return resolve(grade, [...new Set(ids)]).filter((q) => q.difficulty === "LV1" && q.autoMarkable);
}

/** One random basic MCQ for the "Find the key" modal. */
export function getUnlockQuestion(grade: Grade, topicId: string, rand: () => number = Math.random): Question | undefined {
  const topic = getTopic(grade, topicId);
  if (!topic) return undefined;
  const mcqs = resolve(grade, topic.unlockPool).filter((q) => q.type === "mcq" && q.autoMarkable);
  return mcqs.length ? mcqs[Math.floor(rand() * mcqs.length)] : undefined;
}

export function getFigure(grade: Grade, figureKey: string | undefined): number | undefined {
  return figureKey ? contentFor(grade).figures[figureKey] : undefined;
}
