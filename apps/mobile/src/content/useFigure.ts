import { useEffect, useState } from "react";
import type { Grade } from "@p6/shared";
import { ensureFigure, getFigure, getPatchFigureUrl } from "./index";
import type { FigureImage } from "./figpack";
import { useQuestionPatches } from "../store/questionPatches";

/**
 * A figure the editor changed after the bundle was built: shown from its URL (cached on the device by expo-image, and
 * prefetched when the patch arrives). Size is unknown unless the server supplied it. `fallback` = the bundled figure,
 * used when the URL can't be loaded (never cached and offline).
 */
export interface RemoteFigure {
  remote: true;
  uri: string;
  width?: number;
  height?: number;
  fallback?: FigureImage;
}
export type ShownFigure = FigureImage | RemoteFigure;

export const isRemoteFigure = (f: ShownFigure | undefined): f is RemoteFigure => typeof f === "object" && f !== null && "remote" in f;

/**
 * A question's figure for display. Immediate when already extracted; otherwise undefined for a moment, then re-renders.
 * A patch with `figureUrl` for `questionId` (default: the figure key, which is the question id) wins over the bundled one.
 */
export function useFigure(grade: Grade, figureKey: string | undefined, questionId: string | undefined = figureKey): ShownFigure | undefined {
  useQuestionPatches((s) => s.grades[grade]); // a patch arriving re-renders
  const remoteUri = questionId ? getPatchFigureUrl(grade, questionId) : undefined;
  const ready = getFigure(grade, figureKey);
  const [loaded, setLoaded] = useState<{ key: string; img: FigureImage } | null>(null);
  useEffect(() => {
    if (!figureKey || ready) return;
    let live = true;
    ensureFigure(grade, figureKey).then((img) => { if (live && img) setLoaded({ key: figureKey, img }); }, () => {});
    return () => { live = false; };
  }, [grade, figureKey, ready]);
  const bundled = ready ?? (loaded && loaded.key === figureKey ? loaded.img : undefined);
  return remoteUri ? { remote: true, uri: remoteUri, fallback: bundled } : bundled;
}
