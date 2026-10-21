// Automatic class posts: detect the milestones of a level completion and build the posts. Pure.
// The map rule (apps/mobile/src/logic/unlock.ts isLevelUnlocked) is ported here: Level N+1 of every subtopic opens only
// once Level N of ALL the map's subtopics is complete; Level 1 is always open.
import type { ClassPost, LevelNo } from "../shared/index.js";

/** What the server knows about a level's completion for one student. */
export interface LevelDoneInputs {
  /** the level's current questions */
  ids: readonly string[];
  /** questions the student has a star on, from qstats (c = true) */
  starred: ReadonlySet<string>;
  /** users/{uid}/progress/{grade}.levels[key] (device-synced): completed flag and stars */
  progress?: { completed?: boolean; correctIds?: readonly string[] };
}
/** Complete = marked complete, or every one of the level's questions has its star (qstats or synced progress). */
export function isLevelDone(x: LevelDoneInputs): boolean {
  if (x.progress?.completed) return true;
  if (!x.ids.length) return false;
  return x.ids.every((id) => x.starred.has(id) || (x.progress?.correctIds ?? []).includes(id));
}

/**
 * The level group that this completion opens: when `level` was just completed and every subtopic of the map has `level`
 * complete, level + 1 opens (null for level 3, or while another subtopic is still open at `level`).
 */
export function groupOpened(subtopicIds: readonly string[], level: LevelNo, justCompleted: string, isDone: (subtopicId: string, level: LevelNo) => boolean): LevelNo | null {
  if (level >= 3) return null;
  const all = subtopicIds.every((s) => s === justCompleted || isDone(s, level));
  return all ? ((level + 1) as LevelNo) : null;
}

export interface MilestoneText { subtopicName: string; topicId: string; topicName: string; level: LevelNo; opened: LevelNo | null }
/** The posts for a completed level (and the level group it opened), with ids that make writing them idempotent. */
export function milestonePosts(uid: string, first: string, grade: string, subtopicId: string, m: MilestoneText, now: number): ClassPost[] {
  const posts: ClassPost[] = [{
    id: `ms_${uid}_${grade}_${subtopicId}_${m.level}`, kind: "milestone", createdAt: now, authorUid: uid, studentUid: uid,
    text: `${first} completed ${m.subtopicName} · Level ${m.level}`,
  }];
  if (m.opened) {
    posts.push({
      id: `lu_${uid}_${grade}_${m.topicId}_${m.opened}`, kind: "milestone", createdAt: now + 1, authorUid: uid, studentUid: uid,
      text: `${first} levelled up to LV${m.opened} in ${m.topicName}!`,
    });
  }
  return posts;
}

export const birthdayPost = (uid: string, name: string, date: string, now: number): ClassPost => ({
  id: `bd_${uid}_${date.slice(0, 4)}`, kind: "birthday", createdAt: now, authorUid: uid, studentUid: uid, text: `Happy birthday, ${name}!`,
});
