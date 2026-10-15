#!/usr/bin/env node
// Publishes the tester APK with a small download page to its own Netlify site (not Firebase Hosting: the free plan
// there allows ~360 MB of downloads a day for the whole project, i.e. 2–3 APKs, and would take the web app down).
//
//   node apps/mobile/scripts/deploy-apk.mjs [path/to/app.apk] [--public | --private]    (default apps/mobile/dist-apk/catapult-math-athletes.apk)
//
// Needs NETLIFY_AUTH_TOKEN or NETLIFY_SECRET. Site name NETLIFY_APK_SITE_NAME (default below). Each production deploy
// costs Netlify credits (shared with the API site): deploy only when there is a new APK. Over-the-air updates
// (EAS Update) reach installed apps without a new APK as long as the app version is unchanged.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNetlifyBudget } from "../../../backend/scripts/netlify-budget.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const APK = path.resolve(process.argv.slice(2).find((a) => !a.startsWith("--")) ?? path.join(ROOT, "apps/mobile/dist-apk/catapult-math-athletes.apk"));
const SITE_NAME = process.env.NETLIFY_APK_SITE_NAME || "catapult-math-athletes-download";
const TOKEN = process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_SECRET;
if (!TOKEN) throw new Error("Set NETLIFY_AUTH_TOKEN or NETLIFY_SECRET.");
if (!fs.existsSync(APK)) throw new Error(`APK not found: ${APK}`);

const nl = async (method, url, body) => {
  const r = await fetch(`https://api.netlify.com/api/v1${url}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (r.status >= 300) throw new Error(`${method} ${url}: HTTP ${r.status} ${json.message ?? ""}`);
  return json;
};
const found = await nl("GET", `/sites?name=${SITE_NAME}&filter=all`);
const site = found.find((s) => s.name === SITE_NAME) ?? (await nl("POST", "/sites", { name: SITE_NAME }));
// Visibility: the site stays team-only (Netlify login) unless --public / --private is passed. Archived (team-only) since
// 15 Oct 2026 until the owner says to show it.
if (process.argv.includes("--public") && site.sso_login) await nl("PATCH", `/sites/${site.id}`, { sso_login: false });
if (process.argv.includes("--private") && !site.sso_login) await nl("PATCH", `/sites/${site.id}`, { sso_login: true });

const config = JSON.parse(execFileSync("npx", ["expo", "config", "--type", "public", "--json"], { cwd: path.join(ROOT, "apps/mobile"), encoding: "utf8" }));
const bytes = fs.statSync(APK).size;
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(APK)).digest("hex");
const file = `catapult-math-athletes-${config.version}.apk`;
const built = new Date().toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });

const out = fs.mkdtempSync(path.join(os.tmpdir(), "apk-site-"));
fs.copyFileSync(APK, path.join(out, file));
fs.copyFileSync(path.join(ROOT, "apps/mobile/assets/ui/app-icon.png"), path.join(out, "icon.png"));
fs.writeFileSync(path.join(out, "_headers"), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n/*.apk\n  Content-Type: application/vnd.android.package-archive\n  Content-Disposition: attachment; filename="${file}"\n`);
fs.writeFileSync(path.join(out, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Catapult Math Athletes for Android</title><link rel="icon" href="icon.png">
<style>
:root{--bg:#fff7ea;--ink:#2a1f1a;--soft:#6b5b52;--card:#fff;--line:#2a1f1a;--blue:#12aecf}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:520px;margin:0 auto;padding:32px 16px 48px}
img{width:96px;height:96px;border-radius:22px;border:3px solid var(--line)}
h1{font-size:28px;line-height:1.2;margin:16px 0 4px}
.meta{color:var(--soft);margin:0 0 24px}
a.btn{display:block;text-align:center;background:var(--blue);color:#fff;font-weight:800;font-size:20px;text-decoration:none;padding:16px;border:3px solid var(--line);border-radius:16px}
ol{background:var(--card);border:3px solid var(--line);border-radius:16px;padding:16px 16px 16px 40px;margin:24px 0}
li{margin:6px 0}
small{color:var(--soft);word-break:break-all}
</style></head><body><main>
<img src="icon.png" alt="">
<h1>Catapult Math Athletes</h1>
<p class="meta">Android test version ${config.version} · ${(bytes / 1e6).toFixed(0)} MB · ${built}</p>
<a class="btn" href="${file}" download>Download for Android</a>
<ol>
<li>Tap <b>Download for Android</b> and open the file when it finishes.</li>
<li>If Android asks, allow your browser to <b>install unknown apps</b>, then tap <b>Install</b>.</li>
<li>Open the app and sign up with email. Your stars and friends are the same as on the web app.</li>
<li>Updates arrive by themselves: the app downloads them when you open it and uses them the next time.</li>
</ol>
<p>On an iPhone, iPad or computer? Use the web app: <a href="https://catapult-math-athletes.web.app">catapult-math-athletes.web.app</a></p>
<p><small>SHA-256 ${sha256}</small></p>
</main></body></html>
`);
await assertNetlifyBudget("APK page");
console.log(`Deploying ${file} (${(bytes / 1e6).toFixed(1)} MB) to ${SITE_NAME}`);
execFileSync("npx", ["-y", "netlify-cli@27", "deploy", "--prod", "--no-build", "--dir", out, "--site", site.id, "--message", `apk ${config.version}`], { cwd: out, stdio: "inherit", env: { ...process.env, NETLIFY_AUTH_TOKEN: TOKEN } }); // cwd outside the repo: no monorepo project prompt
fs.rmSync(out, { recursive: true, force: true });
const url = site.ssl_url || `https://${SITE_NAME}.netlify.app`;
const head = await fetch(`${url}/${file}`, { method: "HEAD" });
console.log(`Check: ${url}/${file} → HTTP ${head.status}, ${head.headers.get("content-length")} bytes, ${head.headers.get("content-type")}`);
console.log(`Download page: ${url}`);
