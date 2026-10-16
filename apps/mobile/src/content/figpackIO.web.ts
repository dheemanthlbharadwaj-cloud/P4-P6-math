// Web: no file system. Reads a pack over HTTP (the browser caches it) and serves each slice as a blob url.
// (The shareable preview build uses its own registry and never gets here; this keeps a plain web export working.)
import { Asset } from "expo-asset";
import type { FigureIO } from "./figpack";

export function createNativeIO(packs: number[]): FigureIO {
  const bufs = new Map<number, Promise<ArrayBuffer>>();
  const urls = new Map<string, string>();
  return {
    uriFor: (hash, name) => `${hash}/${name}`,
    has: (uri) => urls.has(uri),
    put(uri, bytes) {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/webp" }));
      urls.set(uri, url);
      return url;
    },
    async readSlice(pack, offset, length) {
      let b = bufs.get(pack);
      if (!b) {
        const url = Asset.fromModule(packs[pack]).uri;
        // 3 tries with backoff; a failed download is forgotten so the next call tries again.
        b = (async () => {
          for (let attempt = 0; ; attempt++) {
            try {
              const r = await fetch(url);
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              return await r.arrayBuffer();
            } catch (e) {
              if (attempt >= 2) throw e;
              await new Promise((res) => setTimeout(res, 400 * 3 ** attempt));
            }
          }
        })();
        bufs.set(pack, b);
        b.catch(() => bufs.delete(pack));
      }
      return new Uint8Array(await b, offset, length);
    },
    cleanup() {},
  };
}
