// Copies the compiled backend (../functions/lib) into lib/ so the Netlify functions bundle it (Netlify only packs
// files inside this folder). Generated, git-ignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../functions/lib");
const dst = path.resolve(here, "../lib");
if (!fs.existsSync(path.join(src, "index.js"))) throw new Error("Build ../functions first (npm --prefix ../functions run build).");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true, filter: (f) => !f.endsWith(".map") });
console.log("copied functions/lib → netlify/lib");
