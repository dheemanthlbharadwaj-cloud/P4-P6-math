import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { GetQuestionPatchesResponse } from "./shared/index.js";
import { col, db, requireUid, throwFail } from "./admin.js";
import { CONTENT, type ServerContent } from "./content/index.js";
import { PATCH_LIMIT, patchFloor, patchPage, validatePatchRequest, type PatchPage } from "./logic/patches.js";
import { PatchCache, type PatchView } from "./logic/patchCache.js";

/** One page of edits after `since` (never before the bundle's snapshot): `last_edited_at > floor`, ordered by it. A range
 *  and orderBy on the one field use Firestore's automatic single-field index (no composite index). One read per doc read. */
export async function queryPatchPage(grade: string, content: ServerContent, since: string): Promise<PatchPage> {
  const floor = patchFloor(content, since);
  const snap = await db.collection(col.questions).where("last_edited_at", ">", floor).orderBy("last_edited_at").limit(PATCH_LIMIT).get();
  const docs = snap.docs.map((d) => ({ doc: { ...d.data(), id: d.id }, editedAt: String(d.get("last_edited_at")) }));
  return patchPage(grade as "P6", content, docs, floor);
}

/**
 * Questions of the app's bundle that the editor changed after the bundle was built. Auth required. Always answers from
 * the SERVER's bundle: an app one OTA behind (bundleVersion differs from the server's) still gets patches for the ids
 * the server's bundle has (the ids both know are the same questions; a patch for an id the app lacks is simply unused).
 * New questions and level changes come with a new bundle, not with patches.
 */
export const getQuestionPatches = onCall(async (req): Promise<GetQuestionPatchesResponse> => {
  requireUid(req);
  const v = validatePatchRequest(req.data);
  if (!v.ok) throwFail(v);
  const { grade, bundleVersion, since } = v.req;
  const content = CONTENT[grade];
  if (!content) throw new HttpsError("failed-precondition", "No content for this grade.");
  const page = await queryPatchPage(grade, content, since);
  return { grade, bundleVersion, until: page.until, patches: page.patches, more: page.more };
});

const VIEW_WAIT_MS = 4000;
const caches = new Map<string, PatchCache>();

/** The editor's edits as the server marks with them (see logic/patchCache.ts). Never throws: no edits on any failure. */
export async function patchView(grade: string): Promise<PatchView | null> {
  const content = CONTENT[grade];
  if (!content) return null;
  let c = caches.get(grade);
  if (!c) caches.set(grade, (c = new PatchCache(content, (since) => queryPatchPage(grade, content, since))));
  // Never wait long: a slow refresh carries on in the background and the submit marks with the bundle's answers meanwhile.
  const slow = new Promise<null>((r) => setTimeout(() => r(null), VIEW_WAIT_MS).unref?.());
  try { return await Promise.race([c.get(), slow]); } catch { return null; }
}
