// Pure merge of the "previously wrong" bookmarks between this device and Firestore (users/{uid}/wrong/{questionId}).
import type { Grade } from "@p6/shared";

export interface WrongDoc {
  id: string; // question id
  active: boolean; // currently flagged (false = answered right later, kept for "all wrong ever")
  flaggedAt: number;
}
export interface WrongLocal {
  byGrade: Partial<Record<Grade, Record<string, number>>>;
  history: Partial<Record<Grade, string[]>>;
}

/** History is a union. A question this device already knows about keeps its local flag state; unknown ones take the server's. */
export function mergeWrong(local: WrongLocal, grade: Grade, remote: WrongDoc[]): WrongLocal {
  const history = new Set(local.history[grade] ?? []);
  const known = new Set(history);
  const flagged = { ...(local.byGrade[grade] ?? {}) };
  for (const r of remote) {
    history.add(r.id);
    if (!known.has(r.id) && r.active) flagged[r.id] = r.flaggedAt;
  }
  return {
    byGrade: { ...local.byGrade, [grade]: flagged },
    history: { ...local.history, [grade]: [...history] },
  };
}

/** Docs to write so the server matches this device: everything whose active-state differs from what was last synced. */
export function wrongDocsToPush(local: WrongLocal, grade: Grade, synced: Map<string, boolean>): WrongDoc[] {
  const flagged = local.byGrade[grade] ?? {};
  const out: WrongDoc[] = [];
  for (const id of local.history[grade] ?? []) {
    const active = id in flagged;
    if (synced.get(id) !== active) out.push({ id, active, flaggedAt: flagged[id] ?? 0 });
  }
  return out;
}
