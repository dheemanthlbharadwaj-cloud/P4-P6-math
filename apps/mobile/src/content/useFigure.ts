import { useEffect, useState } from "react";
import type { Grade } from "@p6/shared";
import { ensureFigure, getFigure } from "./index";
import type { FigureImage } from "./figpack";

/** A question's figure for <Image source>. Immediate when already extracted; otherwise undefined for a moment, then re-renders. */
export function useFigure(grade: Grade, figureKey: string | undefined): FigureImage | undefined {
  const ready = getFigure(grade, figureKey);
  const [loaded, setLoaded] = useState<{ key: string; img: FigureImage } | null>(null);
  useEffect(() => {
    if (!figureKey || ready) return;
    let live = true;
    ensureFigure(grade, figureKey).then((img) => { if (live && img) setLoaded({ key: figureKey, img }); }, () => {});
    return () => { live = false; };
  }, [grade, figureKey, ready]);
  return ready ?? (loaded && loaded.key === figureKey ? loaded.img : undefined);
}
