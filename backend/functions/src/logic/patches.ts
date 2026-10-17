// Live question edits: editor doc → patch for a question of the app's bundle. Pure (the Firestore query is in ../patches.ts).
import { createHash } from "node:crypto";
import {
  ACTIVE_GRADES, type GetQuestionPatchesRequest, type Grade, type Question, type QuestionPatch,
} from "../shared/index.js";
import { docToQuestion, type EditorDoc } from "../question/question.js";
import type { QuestionMeta, ServerContent, ServerQuestion } from "../content/index.js";
import type { Fail, Ok } from "./rules.js";

/** One page of the patches query: also the most one call (and one refresh page) reads. */
export const PATCH_LIMIT = 300;
const LEVEL: Record<number, "LV1" | "LV2" | "LV3"> = { 1: "LV1", 2: "LV2", 3: "LV3" };

/** Short hash of an editor figure_url (generated content keeps it instead of the url; same in scripts/copy-shared.mjs). */
export const figHash = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 10);

const fail = (message: string): Fail => ({ ok: false, code: "invalid-argument", message });
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

export function validatePatchRequest(r: unknown): Fail | Ok<{ req: GetQuestionPatchesRequest }> {
  const x = r as Partial<GetQuestionPatchesRequest> | null;
  if (!x || typeof x !== "object") return fail("missing body");
  if (!x.grade || !ACTIVE_GRADES.includes(x.grade)) return fail("bad grade");
  if (typeof x.bundleVersion !== "string" || x.bundleVersion.length > 80) return fail("bad bundleVersion");
  if (typeof x.since !== "string" || (x.since !== "" && (x.since.length > 40 || !ISO.test(x.since) || Number.isNaN(Date.parse(x.since))))) return fail("bad since");
  return { ok: true, req: { grade: x.grade, bundleVersion: x.bundleVersion, since: x.since } };
}

/** Edits older than this are already in the bundle: the later of `since` and when the bundle's editor snapshot was read.
 *  ISO strings of the same format compare as text, as the editor's last_edited_at does in the query. */
export function patchFloor(content: ServerContent, since: string): string {
  const built = content.snapshotAt || content.builtAt;
  return since > built ? since : built;
}

/** The editor retired the question: excluded, or un-picked (selected was true when the bundle was built, no longer is).
 *  Pool questions were never picked, so "selected: false" alone does not retire them. */
export function isRetired(doc: EditorDoc, meta: QuestionMeta): boolean {
  return doc.excluded === true || (meta.p === 1 && doc.selected !== true);
}

const isUrl = (v: unknown): v is string => typeof v === "string" && /^https:\/\//.test(v);

/** The patch for one edited doc, or null when the id is not in the grade's bundle. */
export function buildPatch(grade: Grade, content: ServerContent, doc: EditorDoc, editedAt: string): QuestionPatch | null {
  const meta = content.questions[doc.id];
  if (!meta) return null;
  if (isRetired(doc, meta)) return { id: doc.id, question: null, editedAt };
  const url = isUrl(doc.figure_url) ? doc.figure_url : null;
  // Changed = the editor's figure_url is not the one the bundled image came from (unknown source: only a new figure counts).
  const changed = !!url && (meta.u ? figHash(url) !== meta.u : !meta.f);
  const removed = !url && !!meta.f && !!meta.u; // the editor dropped a figure the bundle took from it
  const { question } = docToQuestion(doc, {
    grade, subtopicId: content.subtopics[meta.s], topic: meta.c, difficulty: LEVEL[meta.d], hasFigure: changed || (!!meta.f && !removed),
  });
  return { id: doc.id, question, ...(changed ? { figureUrl: url! } : {}), editedAt };
}

/** What marking needs from a (patched) question; null = it can no longer be marked automatically. */
export function toServerQuestion(q: Question): ServerQuestion | null {
  if (!q.autoMarkable) return null;
  return q.type === "mcq" ? { t: "mcq", o: q.correctOption ?? "" } : { t: "open", p: (q.parts ?? []).map((x) => x.answer) };
}

export interface EditedDoc { doc: EditorDoc; editedAt: string }

/** last_edited_at as an ISO string: the editor app stores a Firestore Timestamp, our scripts an ISO string. */
export function editedAtIso(v: unknown): string {
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") return (v as { toDate(): Date }).toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v ?? "");
}

/**
 * Merges the pages of the two last_edited_at types (each ordered, at most `limit` long) into one ordered page of at
 * most `limit`. A source that hit its limit may hold more edits after its last one, so the merge stops there (the rest
 * comes with the next call); `more` tells whether anything is left.
 */
export function mergeEditedPages(a: EditedDoc[], b: EditedDoc[], limit = PATCH_LIMIT): { docs: EditedDoc[]; more: boolean } {
  const cmp = (x: EditedDoc, y: EditedDoc) => (x.editedAt < y.editedAt ? -1 : x.editedAt > y.editedAt ? 1 : x.doc.id < y.doc.id ? -1 : x.doc.id > y.doc.id ? 1 : 0);
  const full = [a, b].filter((p) => p.length >= limit);
  const cutoff = full.length ? full.map((p) => p[p.length - 1].editedAt).sort()[0] : null;
  let merged = [...a, ...b].sort(cmp);
  if (cutoff !== null) merged = merged.filter((d) => d.editedAt <= cutoff);
  const more = full.length > 0 || merged.length > limit;
  return { docs: merged.slice(0, limit), more };
}

export interface PatchPage { patches: QuestionPatch[]; until: string; more: boolean }

/** Docs of one query page (already ordered by last_edited_at) → the response body. */
export function patchPage(grade: Grade, content: ServerContent, docs: EditedDoc[], since: string, limit = PATCH_LIMIT, more = docs.length >= limit): PatchPage {
  const patches: QuestionPatch[] = [];
  for (const d of docs) {
    const p = buildPatch(grade, content, d.doc, d.editedAt);
    if (p) patches.push(p);
  }
  // `until` is the last edit READ (also of docs outside the bundle), so the next call starts after it.
  return { patches, until: docs.length ? docs[docs.length - 1].editedAt : since, more };
}

/**
 * The response for one getQuestionPatches call, served from the cached patch list (latest patch per question, ordered by
 * editedAt then id) instead of a Firestore query: patches with `editedAt > floor`, at most `limit`. `until` is the last
 * patch of the page when there is more, else the later of the floor and `cacheUntil` (the last edit the cache has read,
 * also of docs outside the bundle), so the next call starts after it. Same contract as patchPage.
 */
export function servePatches(list: QuestionPatch[], cacheUntil: string, floor: string, limit = PATCH_LIMIT): PatchPage {
  const matching = list.filter((p) => p.editedAt > floor);
  if (matching.length > limit) {
    const patches = matching.slice(0, limit);
    return { patches, until: patches[limit - 1].editedAt, more: true };
  }
  const last = matching.length ? matching[matching.length - 1].editedAt : floor;
  const until = [floor, last, cacheUntil].reduce((a, b) => (b > a ? b : a));
  return { patches: matching, until, more: false };
}
