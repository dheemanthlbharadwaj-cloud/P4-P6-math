import type { GradeProgress, LevelNo } from "@p6/shared";
import { isLevelComplete, levelStarCount } from "./unlock";

const LEVELS: LevelNo[] = [1, 2, 3];

export interface TopicSummary {
  /** Levels completed on the map, and how many it has (subtopics x 3). */
  done: number;
  total: number;
  /** Stars earned on the map, and the most it can show (5 per level). */
  stars: number;
  totalStars: number;
}

/** Progress hint for one topic map, from the same rules the map buttons use. `idsOf` gives a level's current question ids. */
export function topicSummary(
  p: GradeProgress | undefined,
  subtopicIds: readonly string[],
  idsOf: (subtopicId: string, level: LevelNo) => { ids: readonly string[]; total: number },
): TopicSummary {
  let done = 0;
  let total = 0;
  let stars = 0;
  for (const level of LEVELS) {
    for (const id of subtopicIds) {
      const cur = idsOf(id, level);
      total += 1;
      if (isLevelComplete(p, id, level, (s, l) => idsOf(s, l).ids)) done += 1;
      stars += levelStarCount(p, id, level, 5, { ids: cur.ids, slots: cur.total });
    }
  }
  return { done, total, stars, totalStars: total * 5 };
}

/** The map pages on screen when the list starts at `index` and `perView` maps show at once. */
export function isTopicInView(topicIndex: number, index: number, perView: number): boolean {
  return topicIndex >= index && topicIndex < index + perView;
}
