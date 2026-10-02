"""Build a self-contained web preview of the app (for a shareable browser link, e.g. a claude.ai Artifact).

    pip install pillow
    python scripts/web-preview.py            # → dist-preview/  (index.html + files)

The normal web export assumes it is served from a site root and ships every question figure as its own file
(1,600+). This script makes it work from any folder with few files:
1. Figures are resized and packed into a handful of binary pack files; the page unpacks them into blob URLs
   before the app starts, and a temporary web-only figures registry (figures/index.web.ts) reads them.
2. Asset URLs in the bundle become relative to the page's folder.
3. The router sees "/" as the start path whatever folder the page is served from.
Phone builds are untouched: index.web.ts exists only while this script runs.
"""
import glob
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys

from PIL import Image

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GRADE = "P6"
FIG_DIR = os.path.join(APP, "assets", "content", GRADE, "figures")
WEB_REGISTRY = os.path.join(FIG_DIR, "index.web.ts")
EXPORT = os.path.join(APP, "dist-web-raw")
OUT = os.path.join(APP, "dist-preview")
PACK_LIMIT = 12 * 1024 * 1024  # bytes per pack file
MAX_W, QUALITY = 760, 70

REGISTRY_TS = """// TEMPORARY web-preview registry written by scripts/web-preview.py (deleted after export).
// Figures come from packs the preview page unpacks into blob URLs before the app starts.
type Fig = { uri: string; width: number; height: number };
const loaded = (): Record<string, Fig> => (globalThis as unknown as { __P6_FIGS__?: Record<string, Fig> }).__P6_FIGS__ ?? {};
export const figures = new Proxy({} as Record<string, number>, {
  get: (_t, id) => (typeof id === "string" ? (loaded()[id] as unknown as number) : undefined),
  has: (_t, id) => typeof id === "string" && id in loaded(),
});
"""


def run(cmd, cwd):
    r = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"{cmd} failed:\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}")


def main():
    figs = sorted(glob.glob(os.path.join(FIG_DIR, "*.webp")))
    with open(WEB_REGISTRY, "w") as f:
        f.write(REGISTRY_TS)
    try:
        shutil.rmtree(EXPORT, ignore_errors=True)
        run(f"npx expo export --platform web --output-dir {EXPORT}", APP)
    finally:
        os.remove(WEB_REGISTRY)

    shutil.rmtree(OUT, ignore_errors=True)
    os.makedirs(OUT)
    # app files (no figures were bundled thanks to the registry)
    for src in glob.glob(os.path.join(EXPORT, "**", "*"), recursive=True):
        rel = os.path.relpath(src, EXPORT)
        if os.path.isdir(src) or rel in ("index.html", "metadata.json"):
            continue
        if rel.startswith("_expo/"):  # top-level names starting with "_" are reserved by some hosts
            rel = os.path.join("js", os.path.basename(rel))
        dst = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if rel.endswith(".js"):
            js = open(src, encoding="utf8").read()
            js = js.replace('uri:"/assets/', 'uri:globalThis.__P6BASE__+"assets/')
            open(dst, "w", encoding="utf8").write(js)
        else:
            shutil.copy(src, dst)
    entry = os.path.relpath(glob.glob(os.path.join(OUT, "js", "entry-*.js"))[0], OUT)

    # figure packs
    index, packs, buf, n = {}, [], io.BytesIO(), 0

    def flush():
        nonlocal buf, n
        if buf.tell():
            name = f"figpack-{n}.webp"  # WebP images joined end to end (a type static hosts serve)
            open(os.path.join(OUT, name), "wb").write(buf.getvalue())
            packs.append({"file": name, "bytes": buf.tell()})
            buf, n = io.BytesIO(), n + 1

    for f in figs:
        im = Image.open(f)
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        b = io.BytesIO()
        im.save(b, "WEBP", quality=QUALITY, method=4)
        data = b.getvalue()
        if buf.tell() + len(data) > PACK_LIMIT:
            flush()
        index[os.path.basename(f)[:-5]] = [n, buf.tell(), len(data), im.width, im.height]
        buf.write(data)
    flush()
    json.dump({"packs": packs, "figs": index}, open(os.path.join(OUT, "figpack-index.json"), "w"), separators=(",", ":"))

    total = sum(p["bytes"] for p in packs)
    stamp = hashlib.sha1(open(os.path.join(OUT, entry), "rb").read()).hexdigest()[:8]
    page = PAGE.replace("__ENTRY__", entry).replace("__STAMP__", stamp)
    open(os.path.join(OUT, "index.html"), "w").write(page)
    files = [os.path.relpath(p, OUT) for p in glob.glob(os.path.join(OUT, "**", "*"), recursive=True) if os.path.isfile(p)]
    print(json.dumps({"out": OUT, "files": len(files), "figures": len(index), "packs": len(packs),
                      "packMB": round(total / 1e6, 1), "entry": entry}))


PAGE = """<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Catapult Math Athletes</title>
<style>
  :root { --bg: #fff7e6; --ink: #2b2d42; --soft: #5b5e78; --accent: #2a9d8f; --track: #e3e1f0; color-scheme: light; }
  html, body { height: 100%; }
  body { background: var(--bg); color: var(--ink); overflow: hidden; }
  #root { display: flex; height: 100%; flex: 1; }
  #boot { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 14px; padding-inline: 24px; background: var(--bg); font: 600 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; text-align: center; }
  #boot[hidden] { display: none; }
  #boot h1 { font-size: 26px; margin: 0; }
  #boot p { margin: 0; color: var(--soft); font-weight: 500; max-width: 32ch; }
  #bar { width: min(280px, 80vw); height: 14px; border: 3px solid var(--ink); border-radius: 10px; overflow: hidden; background: var(--track); }
  #bar > i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .2s; }
  @media (prefers-reduced-motion: reduce) { #bar > i { transition: none; } }
</style>
<div id="root"></div>
<div id="boot" role="status" aria-live="polite">
  <h1>Catapult Math Athletes</h1>
  <p id="bootmsg">Loading the question bank and figures…</p>
  <div id="bar"><i id="barfill"></i></div>
</div>
<script>
(function () {
  // Asset URLs in the bundle are relative to this page's folder.
  var base = location.href.split("#")[0].split("?")[0];
  globalThis.__P6BASE__ = base.slice(0, base.lastIndexOf("/") + 1);
  var fill = document.getElementById("barfill"), msg = document.getElementById("bootmsg");
  function startApp() {
    // The app's router reads the address bar; start it at "/" whatever folder this page lives in.
    try { history.replaceState(null, "", "/"); } catch (e) {}
    var s = document.createElement("script");
    s.src = globalThis.__P6BASE__ + "__ENTRY__?v=__STAMP__";
    s.onload = function () { setTimeout(function () { document.getElementById("boot").hidden = true; }, 300); };
    s.onerror = function () { msg.textContent = "The app could not load. Reload the page to try again."; };
    document.body.appendChild(s);
  }
  fetch(globalThis.__P6BASE__ + "figpack-index.json").then(function (r) { return r.json(); }).then(function (ix) {
    var total = ix.packs.reduce(function (a, p) { return a + p.bytes; }, 0), done = 0, blobs = [];
    return Promise.all(ix.packs.map(function (p, i) {
      return fetch(globalThis.__P6BASE__ + p.file).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
        blobs[i] = buf; done += p.bytes; fill.style.width = Math.round(done / total * 100) + "%";
      });
    })).then(function () {
      var figs = {};
      Object.keys(ix.figs).forEach(function (id) {
        var f = ix.figs[id];
        var url = URL.createObjectURL(new Blob([new Uint8Array(blobs[f[0]], f[1], f[2])], { type: "image/webp" }));
        figs[id] = { uri: url, width: f[3], height: f[4] };
      });
      globalThis.__P6_FIGS__ = figs;
    });
  }).catch(function () {
    msg.textContent = "Figures could not load, so questions will show without pictures.";
  }).then(startApp);
})();
</script>
"""

if __name__ == "__main__":
    main()
