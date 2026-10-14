// Live question edits: fetch what the editor changed since the bundle was built (getQuestionPatches), keep it on the
// device (src/store/questionPatches.ts) and pre-load changed figures so everything also works offline afterwards.
// Offline / errors are silent: the stored patches (or just the bundle) keep being used.
import { Image } from "expo-image";
import type { Grade } from "@p6/shared";
import { api } from "./api";
import { currentUser } from "./auth";
import { getContentVersion, hasContent } from "../content";
import { useProfile } from "../store/profile";
import { useQuestionPatches } from "../store/questionPatches";
import { patchesForBundle } from "../logic/patches";

/** Calls per refresh at most (the server cuts each answer at its limit and says `more`). */
export const MAX_PAGES = 20;
/** Background refreshes (foreground, the 60 s sync tick) at most this often. */
export const PATCHES_TTL_MS = 10 * 60_000;

let at = 0; // last successful (or attempted-and-answered) refresh
let atUid: string | null = null;
let inFlight: Promise<void> | null = null;

/** Prefetch changed figures into expo-image's disk cache (fire and forget; retried at the next refresh). */
function prefetchFigures(grade: Grade) {
  const g = useQuestionPatches.getState().grades[grade];
  const urls = Object.values(g?.byId ?? {}).flatMap((p) => (p.question && p.figureUrl ? [p.figureUrl] : []));
  if (urls.length) Image.prefetch(urls, "disk").catch(() => {});
}

async function run(grade: Grade) {
  const bundleVersion = getContentVersion(grade);
  const store = useQuestionPatches.getState();
  store.prune(grade, bundleVersion); // a new bundle already contains the older edits
  let since = patchesForBundle(useQuestionPatches.getState().grades[grade], bundleVersion).until;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api.getQuestionPatches({ grade, bundleVersion, since });
    useQuestionPatches.getState().apply(grade, bundleVersion, res);
    if (!res.more || res.until === since) break; // (an answer that doesn't move `until` would loop forever)
    since = res.until;
  }
  prefetchFigures(grade);
}

/**
 * Fetch the question patches for the signed-in student's grade. One call chain in flight at a time; unless `force`,
 * at most one every 10 minutes. Resolves when done; never throws.
 */
export function refreshQuestionPatches(force = false): Promise<void> {
  if (inFlight) return inFlight;
  const uid = currentUser()?.uid ?? null;
  if (!uid) return Promise.resolve(); // signed-in users only
  const grade = useProfile.getState().grade;
  if (!hasContent(grade)) return Promise.resolve();
  if (!force && uid === atUid && Date.now() - at < PATCHES_TTL_MS) return Promise.resolve();
  inFlight = (async () => {
    try {
      await run(grade);
      at = Date.now();
      atUid = uid;
    } catch {
      /* offline or server trouble: keep using what is stored; the next tick / foreground tries again */
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
