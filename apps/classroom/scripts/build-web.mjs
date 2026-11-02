// Build the Classroom web app into dist/ (static single-page app for Firebase Hosting):
//   1. public/figures.json from the game's committed content bundle (scripts/figure-map.mjs; no figure bytes shipped)
//   2. expo export --platform web
//   3. _expo/ → js/ (Hosting serves /js/** with a 1-year immutable cache; names carry a content hash)
// Env: EXPO_PUBLIC_USE_EMULATORS=1 (local tests), EXPO_PUBLIC_BACKEND_URL. Usage: node scripts/build-web.mjs [--out DIR]
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.join(APP, "dist");

execSync("node scripts/figure-map.mjs", { cwd: APP, stdio: "inherit" });
fs.rmSync(OUT, { recursive: true, force: true });
execSync(`npx expo export --platform web --clear --output-dir "${OUT}"`, { cwd: APP, stdio: "inherit" });

if (fs.existsSync(path.join(OUT, "_expo"))) {
  fs.renameSync(path.join(OUT, "_expo"), path.join(OUT, "js"));
  for (const f of fs.readdirSync(OUT, { recursive: true })) {
    const p = path.join(OUT, String(f));
    if (!/\.(html|js|css)$/.test(p) || !fs.statSync(p).isFile()) continue;
    const s = fs.readFileSync(p, "utf8");
    const t = s.replaceAll("/_expo/", "/js/");
    if (t !== s) fs.writeFileSync(p, t);
  }
}
fs.rmSync(path.join(OUT, "metadata.json"), { force: true });
const html = fs.readFileSync(path.join(OUT, "index.html"), "utf8");
if (!/\/js\/static\/js\/web\/entry-[a-f0-9]+\.js/.test(html)) throw new Error("index.html does not load the app bundle");
if (!fs.existsSync(path.join(OUT, "figures.json"))) throw new Error("figures.json missing from the build");
console.log(JSON.stringify({ out: OUT, files: fs.readdirSync(OUT, { recursive: true }).length }));
