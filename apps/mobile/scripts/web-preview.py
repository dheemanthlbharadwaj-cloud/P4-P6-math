"""Build a self-contained web preview of the app (for a shareable browser link, e.g. a claude.ai Artifact).

    pip install pillow
    python scripts/web-preview.py            # → dist-preview/  (index.html + files)

The normal web export assumes it is served from a site root and ships every question figure as its own file
(1,600+). This script makes it work from any folder with few files:
1. Question pictures are NOT shipped: the page loads a small map (figures-<hash>.json: question id -> [Cloudinary URL, width,
   height]) and each <img> is served by Cloudinary (the editor's own storage) with f_auto,q_auto,w_1200,c_limit, so Firebase
   Hosting serves no figure bytes. The map is made from the committed assets/content/<grade>/source-info.json
   (figureSources = the editor figure_url each bundled figure came from) plus the pixel size of the committed bundled
   figure files. A temporary web-only registry (figures/index.web.ts) reads it through globalThis.__P6_LOAD__ / __P6_FIGS__.
2. Asset URLs in the bundle start from a base: "/" by default (the site root, as on Firebase Hosting, where every path
   falls back to index.html, so deep links like /level/P6/... work). `--base .` keeps the old folder-relative build
   (works from any subfolder; the address bar is then reset to "/" before the app starts).
Phone builds are untouched: index.web.ts exists only while this script runs.

    python scripts/web-preview.py [--base /|.|/sub/] [--figures DIR]  (DIR: a folder with manifest.json + the .webp files, read for their pixel sizes)
"""
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

from urllib.parse import quote

from PIL import Image

APP = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GRADE = "P6"
FIG_DIR = os.path.join(APP, "assets", "content", GRADE, "figures")
WEB_REGISTRY = os.path.join(FIG_DIR, "index.web.ts")
EXPORT = os.path.join(APP, "dist-web-raw")
OUT = os.path.join(APP, "dist-preview")
SOURCE_INFO = os.path.join(APP, "assets", "content", GRADE, "source-info.json")
CLOUD_MAX_W = 1200  # Cloudinary caps the delivered width (figures stay sharp on desktop; never upscaled)
CLOUD_TRANSFORM = f"f_auto,q_auto,w_{CLOUD_MAX_W},c_limit"

REGISTRY_TS = """// TEMPORARY web-preview registry written by scripts/web-preview.py (deleted after export).
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
"""


def run(cmd, cwd):
    r = subprocess.run(cmd, cwd=cwd, shell=True, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"{cmd} failed:\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}")


def cloud_url(url):
    """The editor's Cloudinary URL with automatic format/quality and a width cap after /upload/ (version segment kept)."""
    marker = "/image/upload/"
    if "res.cloudinary.com" not in url or marker not in url:
        return url
    head, tail = url.split(marker, 1)
    return head + marker + CLOUD_TRANSFORM + "/" + quote(tail, safe="/:@!$&'()*+,;=~-._%")


def build_figure_map(fig_dir, manifest):
    """question id -> [delivery URL, width, height] for every bundled figure that has an editor URL.
    Size = the committed bundled file (the same picture as the Cloudinary original), capped like the delivery."""
    sources = json.load(open(SOURCE_INFO, encoding="utf8"))["figureSources"]
    out, no_url = {}, []
    for key in sorted(manifest):
        url = sources.get(key)
        if not url:
            no_url.append(key)
            continue
        w, h = Image.open(os.path.join(fig_dir, manifest[key])).size
        if w > CLOUD_MAX_W:
            w, h = CLOUD_MAX_W, max(1, round(h * CLOUD_MAX_W / w))
        out[key] = [cloud_url(url), w, h]
    return out, no_url


def main():
    base = "/"
    if "--base" in sys.argv:
        base = sys.argv[sys.argv.index("--base") + 1]
    if base != ".":
        base = "/" + base.strip("/") + "/" if base.strip("/") else "/"
    fig_dir = os.path.abspath(sys.argv[sys.argv.index("--figures") + 1]) if "--figures" in sys.argv else FIG_DIR
    manifest = json.load(open(os.path.join(fig_dir, "manifest.json"), encoding="utf8"))
    files_by_key = {k: os.path.join(fig_dir, v) for k, v in manifest.items()}
    missing = [k for k, f in files_by_key.items() if not os.path.exists(f)]
    if missing:
        sys.exit(f"manifest lists {len(missing)} missing figure files, e.g. {missing[:3]}")
    figure_map, no_url = build_figure_map(fig_dir, manifest)
    if len(figure_map) < len(manifest) * 0.95:
        sys.exit(f"only {len(figure_map)} of {len(manifest)} figures have an editor URL in source-info.json, e.g. {no_url[:3]}")
    os.makedirs(FIG_DIR, exist_ok=True)
    with open(WEB_REGISTRY, "w") as f:
        f.write(REGISTRY_TS)
    try:
        shutil.rmtree(EXPORT, ignore_errors=True)
        run(f"EXPO_PUBLIC_DEV_TOOLS=1 npx expo export --platform web --clear --output-dir {EXPORT}", APP)  # test build: Dev Tools on; --clear so config (Firebase keys, emulators) changes always apply
    finally:
        if os.path.exists(WEB_REGISTRY):
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

    # figure map (no figure bytes are written to the output)
    fm = json.dumps(figure_map, separators=(",", ":"), ensure_ascii=False)
    fm_name = f"figures-{hashlib.sha1(fm.encode()).hexdigest()[:10]}.json"
    open(os.path.join(OUT, fm_name), "w", encoding="utf8").write(fm)

    stamp = hashlib.sha1(open(os.path.join(OUT, entry), "rb").read()).hexdigest()[:8]
    base_js = '(function () { var b = location.href.split("#")[0].split("?")[0]; return b.slice(0, b.lastIndexOf("/") + 1); })()' if base == "." else json.dumps(base)
    page = (PAGE.replace("__ENTRY__", entry).replace("__STAMP__", stamp).replace("__BASEJS__", base_js)
            .replace("__RELATIVE__", "true" if base == "." else "false")
            .replace("__FIGMAP__", fm_name))
    open(os.path.join(OUT, "index.html"), "w").write(page)
    files = [os.path.relpath(p, OUT) for p in glob.glob(os.path.join(OUT, "**", "*"), recursive=True) if os.path.isfile(p)]
    print(json.dumps({"out": OUT, "base": base, "files": len(files), "figures": len(figure_map), "withoutUrl": no_url,
                      "figureMap": fm_name, "figureMapBytes": len(fm.encode()), "entry": entry}))


PAGE = r"""<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Catapult Math Athletes</title>
<style>
  :root { --bg: #fff7e6; --ink: #2b2d42; --soft: #5b5e78; --accent: #2a9d8f; --track: #e3e1f0; color-scheme: light; }
  html, body { height: 100%; }
  body { background: var(--bg); color: var(--ink); overflow: hidden; }
  #root { display: flex; height: 100%; flex: 1; }
  #boot { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 14px; padding-inline: 24px; background: var(--bg); font: 600 16px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; text-align: center; }
  #boot[hidden] { display: none; }
  #update { position: fixed; left: 12px; right: 12px; top: 12px; z-index: 99999; display: flex; align-items: center; gap: 12px;
            max-width: 520px; margin: 0 auto; padding: 12px 14px; border: 3px solid var(--ink); border-radius: 16px;
            background: #fff0c2; font: 700 16px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); }
  #update[hidden] { display: none; }
  #update span { flex: 1; }
  #update button { font: inherit; padding: 8px 14px; border: 3px solid var(--ink); border-radius: 12px; background: #12aecf; color: #fff; cursor: pointer; }
  #boot h1 { font-size: 26px; margin: 0; }
  #boot p { margin: 0; color: var(--soft); font-weight: 500; max-width: 32ch; }
  #bar { width: min(280px, 80vw); height: 14px; border: 3px solid var(--ink); border-radius: 10px; overflow: hidden; background: var(--track); }
  #bar > i { display: block; height: 100%; width: 0; background: var(--accent); transition: width .2s; }
  @media (prefers-reduced-motion: reduce) { #bar > i { transition: none; } }
</style>
<div id="root"></div>
<div id="update" role="status" hidden><span>A new version of the app is ready.</span><button type="button" onclick="location.reload()">Update</button></div>
<div id="boot" role="status" aria-live="polite">
  <h1>Catapult Math Athletes</h1>
  <p id="bootmsg">Loading the question bank…</p>
  <div id="bar"><i id="barfill"></i></div>
</div>
<script>
if (typeof globalThis === "undefined") window.globalThis = window; // older Safari
(function () {
  var G = globalThis;
  // A tab left open keeps running the version it loaded. When it comes back to the front (and every 10 minutes),
  // look at the published page: if it starts a different app bundle, offer a reload (never forced: a level may be open).
  var ENTRY = "__ENTRY__";
  function checkForUpdate() {
    if (document.hidden) return;
    fetch(location.origin + "/?update-check=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (html) {
      var m = html.match(/js\/entry-[a-f0-9]+\.js/);
      if (m && m[0] !== ENTRY) document.getElementById("update").hidden = false;
    }).catch(function () {});
  }
  document.addEventListener("visibilitychange", checkForUpdate);
  setInterval(checkForUpdate, 10 * 60 * 1000);

  // Where the assets live: "/" on a site root (any URL depth works, so deep links and reloads are fine);
  // a build made with --base . derives it from the page's folder instead.
  var RELATIVE = __RELATIVE__;
  var BASE = __BASEJS__;
  G.__P6BASE__ = BASE;
  var fill = document.getElementById("barfill"), msg = document.getElementById("bootmsg");
  function startApp() {
    // Folder-relative builds: the app's router reads the address bar; start it at "/" whatever folder this page lives in.
    if (RELATIVE) { try { history.replaceState(null, "", "/"); } catch (e) {} }
    var s = document.createElement("script");
    s.src = BASE + ENTRY + "?v=__STAMP__";
    s.onload = function () { setTimeout(function () { document.getElementById("boot").hidden = true; }, 300); };
    s.onerror = function () { msg.textContent = "The app could not load. Reload the page to try again."; };
    document.body.appendChild(s);
  }

  // ---- figures -------------------------------------------------------------------------------------------------
  // Pictures are not hosted here: figures-<hash>.json maps question id -> [Cloudinary URL (f_auto,q_auto), width, height]
  // and the page's <img> loads them straight from Cloudinary. A question whose id is not in the map gets no figure (the
  // app shows "Picture didn't load, tap to retry"; never a crash). A figure that fails to display is re-requested with
  // a cache-busting query (__P6_RELOAD__).
  var figs = G.__P6_FIGS__ = {}, known = G.__P6_KNOWN__ = {}, mapP = null;
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function retry(fn, tries) {
    var n = 0;
    return (function go() { return fn().catch(function (e) { n++; if (n >= tries) throw e; return sleep(400 * Math.pow(3, n - 1)).then(go); }); })();
  }
  function ok(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r; }
  function getMap() {
    if (!mapP) {
      mapP = retry(function () { return fetch(BASE + "__FIGMAP__").then(ok).then(function (r) { return r.json(); }); }, 3);
      mapP.catch(function () { mapP = null; });
    }
    return mapP;
  }
  var bust = 0;
  function load(id, force) {
    if (!force && figs[id]) return Promise.resolve(figs[id]);
    return getMap().then(function (m) {
      var e = m[id];
      if (!e) return undefined;
      var uri = e[0];
      if (force) uri += (uri.indexOf("?") < 0 ? "?" : "&") + "retry=" + Date.now() + "-" + (++bust);
      var f = { uri: uri, width: e[1], height: e[2] };
      figs[id] = f;
      return f;
    });
  }
  G.__P6_LOAD__ = function (id) { return load(id, false); };
  // Drops a figure and builds its request again (its picture would not display).
  G.__P6_RELOAD__ = function (id) { delete figs[id]; return load(id, true); };

  // Start-up loads only the small map; no picture is downloaded until a question shows it.
  function loadPacks() {
    return getMap().then(function (m) {
      Object.keys(m).forEach(function (id) { known[id] = 1; });
      fill.style.width = "100%";
    });
  }
  loadPacks()
    .catch(function () { /* no map: the app starts anyway and asks for figures one by one */ })
    .then(startApp);
})();
</script>
"""

if __name__ == "__main__":
    main()
