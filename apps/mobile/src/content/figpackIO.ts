// Native (iOS/Android) file access for the figure store: packs are app assets (embedded or shipped by an update).
import { Asset } from "expo-asset";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import type { FigureIO } from "./figpack";

const root = () => new Directory(Paths.document, "figs");
const packFiles = new Map<number, Promise<File>>();

function packFile(pack: number, module: number): Promise<File> {
  let p = packFiles.get(pack);
  if (!p) {
    p = (async () => {
      const asset = Asset.fromModule(module);
      await asset.downloadAsync(); // already local for an embedded asset; fetched once for an update's asset
      if (!asset.localUri) throw new Error("figure pack has no local file");
      return new File(asset.localUri);
    })();
    p.catch(() => packFiles.delete(pack)); // retry next time
    packFiles.set(pack, p);
  }
  return p;
}

export function createNativeIO(packs: number[]): FigureIO {
  return {
    uriFor: (hash, name) => new File(root(), hash, name).uri,
    has: (uri) => new File(uri).exists,
    put(uri, bytes) {
      const f = new File(uri);
      f.parentDirectory.create({ intermediates: true, idempotent: true });
      f.create({ overwrite: true });
      f.write(bytes);
      return f.uri;
    },
    async readSlice(pack, offset, length) {
      const file = await packFile(pack, packs[pack]);
      const h = file.open(FileMode.ReadOnly);
      try {
        h.offset = offset;
        return h.readBytes(length);
      } finally {
        h.close();
      }
    },
    cleanup(hash) {
      const dir = root();
      if (!dir.exists) return;
      for (const entry of dir.list()) if (entry.name !== hash) entry.delete();
    },
  };
}
