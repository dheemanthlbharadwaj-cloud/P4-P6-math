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
        b = fetch(Asset.fromModule(packs[pack]).uri).then((r) => r.arrayBuffer());
        bufs.set(pack, b);
      }
      return new Uint8Array(await b, offset, length);
    },
    cleanup() {},
  };
}
