// Fetch the editor's live edits once per signed-in visit (and at most every 10 minutes after that), so worksheets,
// print views, tests and homework show the questions as the editor has them now. Errors are silent: the bundle is used.
import type { Grade } from "@p6/shared";
import { api } from "../services/api";
import { currentUser } from "../services/auth";
import { patchesForBundle } from "../logic/patches";
import { availableGrades, getContentVersion } from "./index";
import { useQuestionPatches } from "./patchStore";

export const MAX_PAGES = 20;
export const PATCHES_TTL_MS = 10 * 60_000;
let at = 0;
let inFlight: Promise<void> | null = null;

async function run(grade: Grade) {
  const bundleVersion = getContentVersion(grade);
  let since = patchesForBundle(useQuestionPatches.getState().grades[grade], bundleVersion).until;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await api.getQuestionPatches({ grade, bundleVersion, since });
    useQuestionPatches.getState().apply(grade, bundleVersion, res);
    if (!res.more || res.until === since) break;
    since = res.until;
  }
}

export function refreshQuestionPatches(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!currentUser()) return Promise.resolve();
  if (!force && Date.now() - at < PATCHES_TTL_MS) return Promise.resolve();
  inFlight = (async () => {
    try {
      for (const g of availableGrades) await run(g);
      at = Date.now();
    } catch { /* offline / server trouble: the bundle (and any patches already here) stay */ } finally { inFlight = null; }
  })();
  return inFlight;
}
