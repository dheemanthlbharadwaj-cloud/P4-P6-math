// TEMPORARY web-preview registry written by scripts/web-preview.py (deleted after export).
// The page loads only the figure index at start-up (globalThis.__P6_KNOWN__); each figure is fetched the first time it is
// needed by the page's loader (globalThis.__P6_LOAD__, looked up in the map) and kept in __P6_FIGS__.
type Fig = { uri: string; width: number; height: number };
type G = { __P6_FIGS__?: Record<string, Fig>; __P6_KNOWN__?: Record<string, unknown>; __P6_LOAD__?: (id: string) => Promise<Fig | undefined> };
const g = globalThis as unknown as G;
const loaded = (): Record<string, Fig> => g.__P6_FIGS__ ?? {};
export const figures = new Proxy({} as Record<string, number>, {
  get: (_t, id) => (typeof id === "string" ? (loaded()[id] as unknown as number) : undefined),
  has: (_t, id) => typeof id === "string" && id in loaded(),
});
export const figureStore = {
  peek: (id: string) => loaded()[id],
  has: (id: string) => id in loaded() || id in (g.__P6_KNOWN__ ?? {}),
  ensure: (id: string): Promise<Fig | undefined> => (loaded()[id] ? Promise.resolve(loaded()[id]) : g.__P6_LOAD__ ? g.__P6_LOAD__(id) : Promise.resolve(undefined)),
  ensureAll: () => Promise.resolve(), // the page already downloaded what it could; the rest is fetched when shown
};
