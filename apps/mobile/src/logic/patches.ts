// Pure logic for live question edits (getQuestionPatches): what is stored per grade and how a server answer merges in.
// Patches are public question data keyed by the bundle version they were computed against, so they are not per-account.
import type { Grade, GetQuestionPatchesResponse, QuestionPatch } from "@p6/shared";

export interface GradePatches {
  /** QuestionBundle.version the patches belong to */
  bundleVersion: string;
  /** pass back as `since` ("" = from the start) */
  until: string;
  byId: Record<string, QuestionPatch>;
}

export const emptyPatches = (bundleVersion: string): GradePatches => ({ bundleVersion, until: "", byId: {} });

/** The stored patches if they belong to the running bundle, else empty: a new bundle already contains the older edits. */
export function patchesForBundle(stored: GradePatches | undefined, bundleVersion: string): GradePatches {
  return stored && stored.bundleVersion === bundleVersion ? stored : emptyPatches(bundleVersion);
}

/** Merge one response into the (version-checked) stored patches; the later editedAt wins, a tie takes the newer answer. */
export function mergePatches(stored: GradePatches | undefined, bundleVersion: string, res: GetQuestionPatchesResponse): GradePatches {
  const base = patchesForBundle(stored, bundleVersion);
  if (res.bundleVersion !== bundleVersion) return base; // the server answered for another bundle: ignore
  const byId = { ...base.byId };
  for (const p of res.patches) {
    const old = byId[p.id];
    if (!old || p.editedAt >= old.editedAt) byId[p.id] = p;
  }
  return { bundleVersion, until: res.until > base.until ? res.until : base.until, byId };
}

/** Questions the editor retired since the bundle was built. */
export function retiredIds(byId: Record<string, QuestionPatch> | undefined): Set<string> {
  const out = new Set<string>();
  if (byId) for (const id in byId) if (byId[id].question === null) out.add(id);
  return out;
}

export type PatchesByGrade = Partial<Record<Grade, GradePatches>>;
