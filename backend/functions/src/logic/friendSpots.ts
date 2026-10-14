/**
 * Where a friend's cat stands on each topic map: the furthest completed level, in map order (every subtopic's
 * Level 1 in subtopic order, then every Level 2, then every Level 3). Topics with no completed level are left out.
 * Returns topicId → levelKey (`${subtopicId}#${level}`).
 */
export function computeFriendSpots(
  topics: { id: string; subtopics: string[] }[],
  levels: Record<string, { completed?: boolean } | undefined> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!levels) return out;
  for (const t of topics) {
    let last: string | null = null;
    for (const level of [1, 2, 3]) {
      for (const sub of t.subtopics) {
        const key = `${sub}#${level}`;
        if (levels[key]?.completed === true) last = key;
      }
    }
    if (last) out[t.id] = last;
  }
  return out;
}
