// A question's figure for display (same shape the game's web build uses, so the ported FigureImg / print sheet work):
// `img` once the figure map has loaded; `failed` when it can't be shown; `retry` loads it again (cache-busting).
import { useCallback, useEffect, useState } from "react";
import type { Grade } from "@p6/shared";
import { getPatchFigureUrl } from "./index";
import { useQuestionPatches } from "./patchStore";
import { useFigureMap } from "./figures";

export interface FigureImage { uri: string; width: number; height: number }
export interface WebFigure { web: true; img?: FigureImage | { uri: string; width?: number; height?: number }; failed: boolean; retry: () => void }
export type ShownFigure = WebFigure;

export const isWebFigure = (f: ShownFigure | undefined): f is WebFigure => !!f && "web" in f;
/** The image behind a shown figure (undefined while loading or failed). */
export const bundledImage = (f: ShownFigure | undefined) => f?.img;

export function useFigure(grade: Grade, figureKey: string | undefined, questionId: string | undefined = figureKey): ShownFigure | undefined {
  useQuestionPatches((s) => s.grades[grade]); // a patch arriving re-renders
  const map = useFigureMap((s) => s.map);
  const mapFailed = useFigureMap((s) => s.failed);
  const [tries, setTries] = useState(0);
  useEffect(() => { if (figureKey && !map) void useFigureMap.getState().load(); }, [figureKey, map, tries]);
  const retry = useCallback(() => { if (!useFigureMap.getState().map) useFigureMap.setState({ failed: false }); setTries((t) => t + 1); }, []);
  if (!figureKey) return undefined;
  const bust = tries ? `${tries}` : "";
  const withBust = (u: string) => (bust ? `${u}${u.includes("?") ? "&" : "?"}retry=${bust}` : u);
  const patched = questionId ? getPatchFigureUrl(grade, questionId) : undefined;
  if (patched) return { web: true, img: { uri: withBust(patched) }, failed: false, retry };
  const e = map?.[figureKey];
  if (e) return { web: true, img: { uri: withBust(e[0]), width: e[1], height: e[2] }, failed: false, retry };
  return { web: true, img: undefined, failed: mapFailed || !!map, retry };
}
