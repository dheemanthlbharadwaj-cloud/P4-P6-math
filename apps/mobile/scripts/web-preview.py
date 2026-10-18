"""Build a self-contained web preview of the app (for a shareable browser link, e.g. a claude.ai Artifact).

    pip install pillow
    python scripts/web-preview.py            # → dist-preview/  (index.html + files)

The normal web export assumes it is served from a site root and ships every question figure as its own file
(1,600+). This script makes it work from any folder with few files:
1. Figures are resized and packed into a handful of binary pack files; the page fetches each figure from its pack
   (Range request) the first time it is shown, and a temporary web-only figures registry (figures/index.web.ts) reads them.
2. Asset URLs in the bundle start from a base: "/" by default (the site root, as on Firebase Hosting, where every path
   falls back to index.html, so deep links like /level/P6/... work). `--base .` keeps the old folder-relative build
   (works from any subfolder; the address bar is then reset to "/" before the app starts).
3. Two figure pack sets are built: WebP (small) and JPEG (for browsers that cannot decode WebP, e.g. old iPad Safari).
   A visitor downloads only one set. Packs are fetched with retries; a pack that still fails does not stop the app,
   its figures are fetched on demand (HTTP Range request, else the whole pack) when a question needs them.
Phone builds are untouched: index.web.ts exists only while this script runs.

    python scripts/web-preview.py [--base /|.|/sub/] [--figures DIR]  (DIR: a folder with manifest.json + the .webp files)
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
MAX_W, QUALITY, JPEG_QUALITY = 760, 70, 82

REGISTRY_TS = """// TEMPORARY web-preview registry written by scripts/web-preview.py (deleted after export).
// The page loads only the figure index at start-up (globalThis.__P6_KNOWN__); each figure is fetched the first time it is
// needed by the page's loader (globalThis.__P6_LOAD__, a Range request into its pack) and kept in __P6_FIGS__.
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


def encode(path, fmt):
    """Resized figure bytes. JPEG gets a white background (no alpha)."""
    im = Image.open(path)
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    b = io.BytesIO()
    if fmt == "jpg":
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.getchannel("A"))
            im = bg
        else:
            im = im.convert("RGB")
        im.save(b, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
    else:
        im.save(b, "WEBP", quality=QUALITY, method=4)
    return b.getvalue(), im.width, im.height


def build_set(fmt, files_by_key):
    """Packs + index for one image format. Returns (index file name, packs, figure count).
    Figure keys (= question ids, may contain spaces) map to files through manifest.json."""
    index, packs, buf, n = {}, [], io.BytesIO(), 0
    cache = {}  # file -> index entry, in case two keys share a file

    def flush():
        nonlocal buf, n
        if buf.tell():
            # Images joined end to end (types a static host serves). Content-hashed names: the host caches
            # them for a year, so a new build must never reuse an old name (a cached pack + new offsets =
            # broken pictures, a cached index = questions without pictures).
            data = buf.getvalue()
            name = f"figpack-{fmt}{n}-{hashlib.sha1(data).hexdigest()[:10]}.{fmt}"
            open(os.path.join(OUT, name), "wb").write(data)
            packs.append({"file": name, "bytes": len(data)})
            buf, n = io.BytesIO(), n + 1

    for key in sorted(files_by_key):
        f = files_by_key[key]
        if f in cache:
            index[key] = list(cache[f])
            continue
        data, w, h = encode(f, fmt)
        if buf.tell() + len(data) > PACK_LIMIT:
            flush()
        index[key] = [n, buf.tell(), len(data), w, h]
        cache[f] = index[key]
        buf.write(data)
    flush()
    ix = json.dumps({"packs": packs, "figs": index}, separators=(",", ":"))
    ix_name = f"figpack-index-{fmt}-{hashlib.sha1(ix.encode()).hexdigest()[:10]}.json"
    open(os.path.join(OUT, ix_name), "w").write(ix)
    return ix_name, packs, len(index)


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

    # figure packs, one set per image format
    webp_ix, webp_packs, n_webp = build_set("webp", files_by_key)
    jpg_ix, jpg_packs, n_jpg = build_set("jpg", files_by_key)

    stamp = hashlib.sha1(open(os.path.join(OUT, entry), "rb").read()).hexdigest()[:8]
    base_js = '(function () { var b = location.href.split("#")[0].split("?")[0]; return b.slice(0, b.lastIndexOf("/") + 1); })()' if base == "." else json.dumps(base)
    page = (PAGE.replace("__ENTRY__", entry).replace("__STAMP__", stamp).replace("__BASEJS__", base_js)
            .replace("__RELATIVE__", "true" if base == "." else "false")
            .replace("__IX_WEBP__", webp_ix).replace("__IX_JPG__", jpg_ix))
    open(os.path.join(OUT, "index.html"), "w").write(page)
    files = [os.path.relpath(p, OUT) for p in glob.glob(os.path.join(OUT, "**", "*"), recursive=True) if os.path.isfile(p)]
    mb = lambda ps: round(sum(p["bytes"] for p in ps) / 1e6, 1)
    print(json.dumps({"out": OUT, "base": base, "files": len(files), "figures": n_webp,
                      "webp": {"packs": len(webp_packs), "MB": mb(webp_packs), "index": webp_ix},
                      "jpg": {"packs": len(jpg_packs), "MB": mb(jpg_packs), "index": jpg_ix}, "entry": entry}))


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
  <p id="bootmsg">Loading the question bank and figures…</p>
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
  // Packs (images joined end to end) are fetched here, before the app starts, and sliced into blob URLs.
  // Which set: WebP, or JPEG when this browser cannot decode WebP (or ?nowebp=1, for testing).
  // Failure handling: every request is retried 3 times; a pack that still fails is skipped (the app starts with the
  // figures that did load) and its figures are fetched when a question needs them (__P6_LOAD__).
  var figs = G.__P6_FIGS__ = {}, known = G.__P6_KNOWN__ = {};
  var IX = { webp: "__IX_WEBP__", jpg: "__IX_JPG__" }, fmt = "webp", ixP = null, whole = {};
  var forceJpg = /[?&]nowebp=1(&|$)/.test(location.search);
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function retry(fn, tries) {
    var n = 0;
    return (function go() { return fn().catch(function (e) { n++; if (n >= tries) throw e; return sleep(400 * Math.pow(3, n - 1)).then(go); }); })();
  }
  function ok(r) { if (!r.ok) throw new Error("HTTP " + r.status); return r; }
  function supportsWebp() {
    if (forceJpg) return Promise.resolve(false);
    return new Promise(function (res) {
      var i = new Image(), done = false;
      function fin(v) { if (!done) { done = true; res(v); } }
      i.onload = function () { fin(i.width === 1 && i.height === 1); };
      i.onerror = function () { fin(false); };
      setTimeout(function () { fin(false); }, 4000);
      i.src = "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAsBMJaQAA3AA/veMAAA=";
    });
  }
  function getIndex() {
    if (!ixP) {
      ixP = retry(function () { return fetch(BASE + IX[fmt]).then(ok).then(function (r) { return r.json(); }); }, 3);
      ixP.catch(function () { ixP = null; });
    }
    return ixP;
  }
  function fetchPack(file, noStore) {
    return retry(function () { return fetch(BASE + file, noStore ? { cache: "no-store" } : undefined).then(ok).then(function (r) { return r.arrayBuffer(); }); }, 3);
  }
  var MIME = function () { return fmt === "jpg" ? "image/jpeg" : "image/webp"; };
  function make(id, e, buf, off) {
    var f = { uri: URL.createObjectURL(new Blob([new Uint8Array(buf, off, e[2])], { type: MIME() })), width: e[3], height: e[4] };
    figs[id] = f;
    return f;
  }
  // The whole pack again (kept in memory briefly, so several figures of one pack cost one download).
  function wholePack(ix, i, noStore) {
    if (!whole[i]) {
      whole[i] = fetchPack(ix.packs[i].file, noStore);
      whole[i].then(function () { setTimeout(function () { delete whole[i]; }, 30000); }, function () { delete whole[i]; });
    }
    return whole[i];
  }
  // One figure from its pack: a Range request for just its bytes, else the whole pack.
  function rangeBytes(ix, e, noStore) {
    var p = ix.packs[e[0]], from = e[1], to = e[1] + e[2] - 1;
    return retry(function () {
      var o = { headers: { Range: "bytes=" + from + "-" + to } };
      if (noStore) o.cache = "no-store";
      return fetch(BASE + p.file, o).then(ok).then(function (r) {
        return r.arrayBuffer().then(function (b) {
          // 206 only counts when it is the pack's own bytes: a compressing CDN may answer a Range request with a slice of
          // the compressed file (Content-Encoding set, total size differs), which is useless.
          var cr = /\/(\d+)$/.exec(r.headers.get("Content-Range") || "");
          if (r.status === 206 && b.byteLength === e[2] && !r.headers.get("Content-Encoding") && cr && +cr[1] === p.bytes) return { buf: b, off: 0 };
          if (r.status === 200 && b.byteLength === p.bytes) return { buf: b, off: from };
          throw new Error("unexpected range response");
        });
      });
    }, 3);
  }
  var inflight = {};
  function load(id, force) {
    if (!force && figs[id]) return Promise.resolve(figs[id]);
    if (inflight[id]) return inflight[id];
    var p = getIndex().then(function (ix) {
      var e = ix.figs[id];
      if (!e) return undefined;
      return rangeBytes(ix, e, force).catch(function () {
        return wholePack(ix, e[0], force).then(function (b) { return { buf: b, off: e[1] }; });
      }).then(function (r) { return make(id, e, r.buf, r.off); });
    });
    inflight[id] = p;
    var clear = function () { delete inflight[id]; };
    p.then(clear, clear);
    return p;
  }
  G.__P6_LOAD__ = function (id) { return load(id, false); };
  // Drops a figure and fetches it again (its picture would not display).
  G.__P6_RELOAD__ = function (id) {
    var old = figs[id];
    delete figs[id];
    if (old) { try { URL.revokeObjectURL(old.uri); } catch (e) {} }
    return load(id, true);
  };

  // Start-up loads only the small figure index; each figure is fetched (Range request) the first time a question shows
  // it. Downloading every pack up front cost ~29 MB per first visit and used up the Firebase Hosting free 10 GB/month.
  function loadPacks() {
    return getIndex().then(function (ix) {
      Object.keys(ix.figs).forEach(function (id) { known[id] = 1; });
      fill.style.width = "100%";
    });
  }
  supportsWebp().then(function (w) { fmt = w ? "webp" : "jpg"; return loadPacks(); })
    .catch(function () { /* no index: the app starts anyway and asks for figures one by one */ })
    .then(startApp);
})();
</script>
"""

if __name__ == "__main__":
    main()
