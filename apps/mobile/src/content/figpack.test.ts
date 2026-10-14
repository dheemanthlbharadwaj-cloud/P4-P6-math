import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFigpacks, packFigures, parseWebpSize } from "../../scripts/build-figpacks.mjs";
import { createFigureStore, figureFileName, syncView, type FigureIO } from "./figpack";

const FIG_DIR = path.resolve(__dirname, "../../assets/content/P6/figures");
const manifest: Record<string, string> = JSON.parse(fs.readFileSync(path.join(FIG_DIR, "manifest.json"), "utf8"));
const ids = Object.keys(manifest);
const sample = [0, 1, 7, 100, Math.floor(ids.length / 2), ids.length - 2, ids.length - 1].map((i) => ids[i]);
const read = (id: string) => fs.readFileSync(path.join(FIG_DIR, manifest[id]));

/** Hand-built WebP headers (only the bytes the parser looks at). */
function webp(kind: "VP8 " | "VP8L" | "VP8X", w: number, h: number): Buffer {
  const b = Buffer.alloc(40);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(32, 4);
  b.write("WEBP", 8, "latin1");
  b.write(kind, 12, "latin1");
  if (kind === "VP8 ") {
    b.set([0x10, 0x00, 0x00, 0x9d, 0x01, 0x2a], 20);
    b.writeUInt16LE(w | 0x4000, 26); // top 2 bits are a scale hint
    b.writeUInt16LE(h, 28);
  } else if (kind === "VP8L") {
    b[20] = 0x2f;
    b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21);
  } else {
    b.writeUIntLE(w - 1, 24, 3);
    b.writeUIntLE(h - 1, 27, 3);
  }
  return b;
}

describe("parseWebpSize", () => {
  it("reads lossy, lossless and extended headers", () => {
    expect(parseWebpSize(webp("VP8 ", 761, 333))).toEqual({ width: 761, height: 333 });
    expect(parseWebpSize(webp("VP8L", 1000, 17))).toEqual({ width: 1000, height: 17 });
    expect(parseWebpSize(webp("VP8X", 16383, 4096))).toEqual({ width: 16383, height: 4096 });
  });
  it("rejects other data", () => {
    expect(() => parseWebpSize(Buffer.from("definitely not a webp image, not at all....."))).toThrow();
    expect(() => parseWebpSize(Buffer.alloc(8))).toThrow();
  });
  it("matches what sharp wrote for the real figures", async () => {
    const sharp = (await import("sharp")).default;
    for (const id of sample) {
      const meta = await sharp(read(id)).metadata();
      expect(parseWebpSize(read(id))).toEqual({ width: meta.width, height: meta.height });
    }
  });
});

describe("packing", () => {
  it("slices of the packs equal the original bytes", () => {
    const figs = ids.slice(0, 120).map((id) => ({ id, data: read(id) }));
    const { packs, index } = packFigures(figs, 2 * 1024 * 1024); // small limit: several packs
    expect(packs.length).toBeGreaterThan(1);
    for (const p of packs) expect(p.length).toBeLessThanOrEqual(2 * 1024 * 1024);
    for (const { id, data } of figs) {
      const [pack, offset, length, width, height] = index[id];
      expect(packs[pack].subarray(offset, offset + length).equals(data)).toBe(true);
      expect({ width, height }).toEqual(parseWebpSize(data));
    }
  });
  it("is deterministic", () => {
    const figs = sample.map((id) => ({ id, data: read(id) }));
    expect(packFigures(figs).index).toEqual(packFigures(figs).index);
  });
  it("buildFigpacks writes packs + registry, then skips when nothing changed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "figpack-"));
    const fdir = path.join(root, "P6", "figures");
    fs.mkdirSync(fdir, { recursive: true });
    const m: Record<string, string> = {};
    for (const id of sample) { fs.writeFileSync(path.join(fdir, manifest[id]), read(id)); m[id] = manifest[id]; }
    fs.writeFileSync(path.join(fdir, "manifest.json"), JSON.stringify(m));
    const first = buildFigpacks({ contentRoot: root }).P6;
    expect(first.built).toBe(true);
    const out = path.join(root, "P6", "figpacks");
    const pack = fs.readFileSync(path.join(out, "pack-0.figpack"));
    expect(pack.length).toBe(sample.reduce((a, id) => a + read(id).length, 0));
    expect(fs.readFileSync(path.join(out, "registry.ts"), "utf8")).toContain(`export const hash = "${first.hash}"`);
    const second = buildFigpacks({ contentRoot: root }).P6;
    expect(second.built).toBe(false);
    expect(second.hash).toBe(first.hash);
    fs.rmSync(root, { recursive: true });
  });
});

describe("figure store", () => {
  const figs = sample.map((id) => ({ id, data: read(id) }));
  const { packs, index } = packFigures(figs, 300 * 1024);
  const makeIO = () => {
    const files = new Map<string, Uint8Array>();
    let reads = 0;
    const cleaned: string[] = [];
    const io: FigureIO = {
      uriFor: (hash, name) => `file:///figs/${hash}/${name}`,
      has: (uri) => files.has(uri),
      put: (uri, bytes) => { files.set(uri, bytes); return uri; },
      readSlice: async (pack, off, len) => { reads++; return packs[pack].subarray(off, off + len); },
      cleanup: (hash) => { cleaned.push(hash); },
    };
    return { io, files, cleaned, reads: () => reads };
  };

  it("extracts on first use, then answers synchronously without touching the pack", async () => {
    const t = makeIO();
    const store = createFigureStore(index, "h1", t.io);
    const id = sample[3];
    expect(store.peek(id)).toBeUndefined();
    const img = await store.ensure(id);
    expect(img).toEqual({ uri: `file:///figs/h1/${figureFileName(id)}`, width: index[id][3], height: index[id][4] });
    expect(Buffer.from(t.files.get((img as { uri: string }).uri)!).equals(read(id))).toBe(true);
    expect(store.peek(id)).toEqual(img);
    const n = t.reads();
    await store.ensure(id);
    expect(t.reads()).toBe(n);
    expect(t.cleaned).toEqual(["h1"]);
  });
  it("finds figures already on disk from an earlier run and shares concurrent extraction", async () => {
    const t = makeIO();
    const a = createFigureStore(index, "h1", t.io);
    await Promise.all([a.ensure(sample[0]), a.ensure(sample[0])]);
    expect(t.reads()).toBe(1);
    const b = createFigureStore(index, "h1", t.io); // "new app launch"
    expect(b.peek(sample[0])).toBeDefined();
  });
  it("ensureAll extracts everything; unknown ids are undefined", async () => {
    const t = makeIO();
    const store = createFigureStore(index, "h2", t.io);
    await store.ensureAll();
    for (const id of sample) expect(store.peek(id)).toBeDefined();
    expect(await store.ensure("nope")).toBeUndefined();
    expect(store.has("nope")).toBe(false);
  });
  it("syncView looks like the figures registry", async () => {
    const store = createFigureStore(index, "h3", makeIO().io);
    const view = syncView(store);
    expect(view[sample[1]]).toBeUndefined();
    await store.ensure(sample[1]);
    expect(view[sample[1]]).toMatchObject({ width: index[sample[1]][3] });
    expect(sample[1] in view).toBe(true);
  });
  it("sanitises file names for ids with spaces", () => {
    expect(figureFileName("2023_St Nicholas_P1_Q19")).toBe("2023_St_Nicholas_P1_Q19.webp");
  });
});
