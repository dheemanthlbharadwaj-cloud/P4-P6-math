// Question figures on the web come from Cloudinary (the editor's own storage), never from this site: the page loads a
// small map {question id → [delivery URL, width, height]} made at build time by scripts/figure-map.mjs from the game's
// committed bundle (source-info.json figureSources + the size of each bundled figure), same rule as the game's web build.
import { create } from "zustand";

export type FigureEntry = [url: string, width: number, height: number];
interface FigureMapState {
  map: Record<string, FigureEntry> | null;
  failed: boolean;
  load: () => Promise<void>;
}
let loading: Promise<void> | null = null;
export const useFigureMap = create<FigureMapState>((set, get) => ({
  map: null,
  failed: false,
  load() {
    if (get().map) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const res = await fetch("/figures.json", { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        set({ map: (await res.json()) as Record<string, FigureEntry>, failed: false });
      } catch {
        set({ failed: true });
      } finally { loading = null; }
    })();
    return loading;
  },
}));
