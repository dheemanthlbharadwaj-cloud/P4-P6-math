// Writes public/figures.json = {question id → [Cloudinary delivery URL, width, height]} for every bundled figure of the
// game's committed content bundle (apps/mobile/assets/content/<grade>): URL from source-info.json figureSources (the
// editor's figure_url), size from the bundled .webp file, delivery f_auto,q_auto,w_1200,c_limit. Same rule as the game's
// scripts/web-preview.py, so this site serves no figure bytes. Run by `npm start` and `npm run build`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.resolve(here, "../../mobile/assets/content");
const OUT = path.resolve(here, "../public/figures.json");
const MAX_W = 1200;
const TRANSFORM = `f_auto,q_auto,w_${MAX_W},c_limit`;

/** Pixel size of a WebP file (VP8 / VP8L / VP8X headers). */
export function webpSize(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") throw new Error("not a webp");
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (chunk === "VP8L") { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
  if (chunk === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  throw new Error(`unknown webp chunk ${chunk}`);
}
/** Cloudinary URL with the delivery transform after /image/upload/ (version segment kept). */
export function cloudUrl(url) {
  const marker = "/image/upload/";
  if (!url.includes("res.cloudinary.com") || !url.includes(marker)) return url;
  const [head, tail] = url.split(marker);
  return `${head}${marker}${TRANSFORM}/${encodeURI(decodeURI(tail))}`;
}

function main() {
  const out = {};
  let noUrl = 0, total = 0;
  for (const grade of fs.readdirSync(CONTENT).filter((g) => fs.existsSync(path.join(CONTENT, g, "source-info.json")))) {
    const figDir = path.join(CONTENT, grade, "figures");
    const manifest = JSON.parse(fs.readFileSync(path.join(figDir, "manifest.json"), "utf8"));
    const sources = JSON.parse(fs.readFileSync(path.join(CONTENT, grade, "source-info.json"), "utf8")).figureSources ?? {};
    for (const [key, file] of Object.entries(manifest)) {
      total++;
      const url = sources[key];
      if (!url) { noUrl++; continue; }
      let { w, h } = webpSize(fs.readFileSync(path.join(figDir, file)));
      if (w > MAX_W) { h = Math.max(1, Math.round((h * MAX_W) / w)); w = MAX_W; }
      out[key] = [cloudUrl(url), w, h];
    }
  }
  if (Object.keys(out).length < total * 0.95) throw new Error(`only ${Object.keys(out).length} of ${total} figures have an editor URL`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(JSON.stringify({ figures: Object.keys(out).length, withoutUrl: noUrl, bytes: fs.statSync(OUT).size }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
