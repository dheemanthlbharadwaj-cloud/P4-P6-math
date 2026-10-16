import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
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
/**
 * Web only: a question's bundled figure that may still be loading, may have failed to download, or may fail to decode.
 * It lets the screen show "Picture didn't load, tap to retry" instead of an empty box. `img` is set once it is ready.
 */
export interface WebFigure {
  web: true;
  img?: FigureImage;
  failed: boolean;
  /** Fetches the picture again. */
  retry: () => void;
}
export type ShownFigure = FigureImage | RemoteFigure | WebFigure;

export const isRemoteFigure = (f: ShownFigure | undefined): f is RemoteFigure => typeof f === "object" && f !== null && "remote" in f;
export const isWebFigure = (f: ShownFigure | undefined): f is WebFigure => typeof f === "object" && f !== null && "web" in f;
/** The bundled image behind any shown figure (undefined while loading or failed). */
export const bundledImage = (f: ShownFigure | undefined): FigureImage | undefined =>
  isRemoteFigure(f) ? f.fallback : isWebFigure(f) ? f.img : f;

/**
 * A question's figure for display. Immediate when already extracted; otherwise undefined for a moment, then re-renders.
 * A patch with `figureUrl` for `questionId` (default: the figure key, which is the question id) wins over the bundled one.
 */
export function useFigure(grade: Grade, figureKey: string | undefined, questionId: string | undefined = figureKey): ShownFigure | undefined {
  useQuestionPatches((s) => s.grades[grade]); // a patch arriving re-renders
  const remoteUri = questionId ? getPatchFigureUrl(grade, questionId) : undefined;
  const ready = getFigure(grade, figureKey);
  const [loaded, setLoaded] = useState<{ key: string; img: FigureImage } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!figureKey || ready) return;
    let live = true;
    ensureFigure(grade, figureKey).then(
      (img) => { if (live) { if (img) setLoaded({ key: figureKey, img }); else setFailedKey(figureKey); } },
      () => { if (live) setFailedKey(figureKey); },
    );
    return () => { live = false; };
  }, [grade, figureKey, ready, tries]);
  const bundled = ready ?? (loaded && loaded.key === figureKey ? loaded.img : undefined);
  // Web: re-fetch (the page's loader drops the old blob and downloads the picture again), then render again.
  const retry = useCallback(() => {
    (globalThis as { __P6_RELOAD__?: (id: string) => Promise<unknown> }).__P6_RELOAD__?.(figureKey ?? "")?.catch(() => {});
    setLoaded(null);
    setFailedKey(null);
    setTries((t) => t + 1);
  }, [figureKey]);
  if (remoteUri) return { remote: true, uri: remoteUri, fallback: bundled };
  if (Platform.OS === "web" && figureKey) return { web: true, img: bundled, failed: !bundled && failedKey === figureKey, retry };
  return bundled;
}
