import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { GetQuestionPatchesResponse } from "./shared/index.js";
import { col, editorDb, requireUid, throwFail } from "./admin.js";
import { CONTENT, type ServerContent } from "./content/index.js";
import { Timestamp } from "firebase-admin/firestore";
import { editedAtIso, mergeEditedPages, PATCH_LIMIT, patchFloor, patchPage, servePatches, validatePatchRequest, type EditedDoc, type PatchPage } from "./logic/patches.js";
import { PatchCache, type PatchView } from "./logic/patchCache.js";

/** One page of edits after `since` (never before the bundle's snapshot): `last_edited_at > floor`, ordered by it. The
 *  editor app stores last_edited_at as a Firestore Timestamp, our scripts as an ISO string, and a range query only matches
 *  its own type: so one query per type (two reads when nothing changed), merged by mergeEditedPages. */
export async function queryPatchPage(grade: string, content: ServerContent, since: string): Promise<PatchPage> {
  const floor = patchFloor(content, since);
  const q = (bound: string | Timestamp) => editorDb.collection(col.questions).where("last_edited_at", ">", bound).orderBy("last_edited_at").limit(PATCH_LIMIT).get();
  const toDocs = (snap: Awaited<ReturnType<typeof q>>): EditedDoc[] => snap.docs.map((d) => ({ doc: { ...d.data(), id: d.id }, editedAt: editedAtIso(d.get("last_edited_at")) }));
  const [strings, stamps] = await Promise.all([q(floor), q(Timestamp.fromDate(new Date(floor)))]);
  const { docs, more } = mergeEditedPages(toDocs(strings), toDocs(stamps));
  return patchPage(grade as "P6", content, docs, floor, PATCH_LIMIT, more);
}

/**
 * Questions of the app's bundle that the editor changed after the bundle was built. Auth required. Always answers from
 * the SERVER's bundle: an app one OTA behind (bundleVersion differs from the server's) still gets patches for the ids
 * the server's bundle has (the ids both know are the same questions; a patch for an id the app lacks is simply unused).
 * New questions and level changes come with a new bundle, not with patches.
 *
 * Served from the per-instance patch cache (logic/patchCache.ts), not from a query per call: 0 Firestore reads while the
 * cache is warm, at most one incremental refresh (new edits, minimum one read) per instance every 10 minutes. Editor edits
 * therefore reach apps within about 10 minutes.
 */
export const getQuestionPatches = onCall(async (req): Promise<GetQuestionPatchesResponse> => {
  requireUid(req);
  const v = validatePatchRequest(req.data);
  if (!v.ok) throwFail(v);
  const { grade, bundleVersion, since } = v.req;
  const content = CONTENT[grade];
  if (!content) throw new HttpsError("failed-precondition", "No content for this grade.");
  const cache = patchCache(grade);
  const view = await Promise.race([cache.get(), new Promise<null>((r) => setTimeout(() => r(null), FIRST_LOAD_WAIT_MS).unref?.())]);
  // Before the first successful load "no edits" would be a lie (the app would move `until` on): ask the app to retry.
  if (!view || !cache.loaded) throw new HttpsError("unavailable", "Question edits are loading, try again shortly.");
  const page = servePatches(view.list, view.until, patchFloor(content, since));
  return { grade, bundleVersion, until: page.until, patches: page.patches, more: page.more };
});

const VIEW_WAIT_MS = 4000;
const FIRST_LOAD_WAIT_MS = 15000;
const caches = new Map<string, PatchCache>();

/** The grade's patch cache (one per instance), created on first use. */
function patchCache(grade: string): PatchCache {
  const content = CONTENT[grade]!;
  let c = caches.get(grade);
  if (!c) caches.set(grade, (c = new PatchCache(content, (since) => queryPatchPage(grade, content, since))));
  return c;
}

/** The editor's edits as the server marks with them (see logic/patchCache.ts). Never throws: no edits on any failure. */
export async function patchView(grade: string): Promise<PatchView | null> {
  if (!CONTENT[grade]) return null;
  const c = patchCache(grade);
  // Never wait long: a slow refresh carries on in the background and the submit marks with the bundle's answers meanwhile.
  const slow = new Promise<null>((r) => setTimeout(() => r(null), VIEW_WAIT_MS).unref?.());
  try { return await Promise.race([c.get(), slow]); } catch { return null; }
}
