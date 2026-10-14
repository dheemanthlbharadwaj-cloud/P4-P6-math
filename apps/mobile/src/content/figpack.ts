// Question figures live in a few big "pack" files (see scripts/build-figpacks.mjs) so an app update ships ~10 assets
// instead of ~1,600. This store turns a figure id into a small image file on first use, entirely offline:
// the pack is an app asset (embedded in the build or downloaded with the update), read locally, sliced and cached.

/** What <Image source> accepts for a figure: a bundled asset id, or a file/blob uri with its size. */
export type FigureImage = number | { uri: string; width: number; height: number };

/** figure id -> [pack number, byte offset, byte length, width, height] */
export type FigureIndex = Record<string, readonly [number, number, number, number, number]>;

/** Platform file access, injected so the store can be tested without a device. */
export interface FigureIO {
  /** Where the figure for this hash and name lives (stable, usable as an image uri once written). */
  uriFor(hash: string, name: string): string;
  has(uri: string): boolean;
  /** Stores the bytes and returns the uri to display. */
  put(uri: string, bytes: Uint8Array): string;
  /** Bytes [offset, offset + length) of a pack asset. */
  readSlice(pack: number, offset: number, length: number): Promise<Uint8Array>;
  /** Removes extracted figures of older builds (everything except `hash`). */
  cleanup(hash: string): void;
}

export interface FigureStore {
  /** Sync: the image when already extracted, else undefined. */
  peek(id: string): FigureImage | undefined;
  /** Extracts the figure if needed (in memory only on first use). Resolves undefined for an unknown id. */
  ensure(id: string): Promise<FigureImage | undefined>;
  /** Extracts every figure in the background, one at a time. */
  ensureAll(): Promise<void>;
  has(id: string): boolean;
}

/** A filesystem-safe name for a figure id. */
export function figureFileName(id: string): string {
  return `${id.replace(/[^A-Za-z0-9_.-]+/g, "_")}.webp`;
}

export function createFigureStore(index: FigureIndex, hash: string, io: FigureIO): FigureStore {
  const ready = new Map<string, FigureImage>();
  const inflight = new Map<string, Promise<FigureImage | undefined>>();
  let cleaned = false;

  const peek = (id: string): FigureImage | undefined => {
    const hit = ready.get(id);
    if (hit) return hit;
    const e = index[id];
    if (!e) return undefined;
    const uri = io.uriFor(hash, figureFileName(id));
    if (!io.has(uri)) return undefined;
    const img = { uri, width: e[3], height: e[4] };
    ready.set(id, img);
    return img;
  };

  const extract = async (id: string): Promise<FigureImage | undefined> => {
    const e = index[id];
    if (!e) return undefined;
    const uri = io.uriFor(hash, figureFileName(id));
    const bytes = await io.readSlice(e[0], e[1], e[2]);
    const img = { uri: io.put(uri, bytes), width: e[3], height: e[4] };
    ready.set(id, img);
    if (!cleaned) {
      cleaned = true;
      try { io.cleanup(hash); } catch { /* old folders are only wasted space */ }
    }
    return img;
  };

  const ensure = (id: string): Promise<FigureImage | undefined> => {
    const hit = peek(id);
    if (hit) return Promise.resolve(hit);
    let p = inflight.get(id);
    if (!p) {
      p = extract(id).finally(() => inflight.delete(id));
      inflight.set(id, p);
    }
    return p;
  };

  return {
    peek,
    ensure,
    has: (id) => id in index,
    async ensureAll() {
      // Sorted by pack then offset: the pack is read front to back.
      const ids = Object.keys(index).sort((a, b) => index[a][0] - index[b][0] || index[a][1] - index[b][1]);
      for (const id of ids) {
        if (peek(id)) continue;
        try { await ensure(id); } catch { /* retried when the figure is actually shown */ }
      }
    },
  };
}

/** `figures[id]` on the registry: a sync lookup that is defined once the figure has been extracted. */
export function syncView(store: FigureStore): Record<string, FigureImage | undefined> {
  return new Proxy({} as Record<string, FigureImage | undefined>, {
    get: (_t, id) => (typeof id === "string" ? store.peek(id) : undefined),
    has: (_t, id) => typeof id === "string" && store.has(id),
  });
}
