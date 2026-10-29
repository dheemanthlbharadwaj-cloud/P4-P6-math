#!/usr/bin/env node
// Environment doctor for Catapult Mathletes: what works in THIS checkout / session, and what to do about the rest.
//
//   node scripts/doctor.mjs            human table (tooling, credentials, live status, "You can now...")
//   node scripts/doctor.mjs --offline  skip every network request
//   node scripts/doctor.mjs --json     machine-readable output
//
// Credentials are reported by presence only; the one value ever shown is the service account's client_email.
// Network checks use global fetch with a 10 s timeout and never fail the run.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as cp from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const OFFLINE = args.has("--offline");
const JSON_OUT = args.has("--json");
if (args.has("--help") || args.has("-h")) {
  console.log("usage: node scripts/doctor.mjs [--offline] [--json]");
  process.exit(0);
}

const OK = "ok", WARN = "warn", FAIL = "fail", SKIP = "skip";
const ICON = { ok: "✅", warn: "⚠️ ", fail: "❌", skip: "➖" };
const checks = [];
const add = (group, name, status, detail, todo = "") => { checks.push({ group, name, status, detail, todo }); return status; };
const run = (cmd, a = []) => { try { return cp.execFileSync(cmd, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 8000 }).trim(); } catch { return null; } };
const javaVersion = () => { // java prints its version on stderr
  const r = cp.spawnSync("java", ["-version"], { encoding: "utf8", timeout: 8000, env: { ...process.env, JAVA_TOOL_OPTIONS: "" } });
  if (r.error) return null;
  return /version "([^"]+)"/.exec((r.stderr || "") + (r.stdout || ""))?.[1] ?? null;
};
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };

// ---------------- tooling ----------------
{
  const major = Number(process.versions.node.split(".")[0]);
  add("tooling", "node", major >= 22 ? OK : FAIL, `v${process.versions.node}`, major >= 22 ? "" : "Need node >= 22 (https://nodejs.org or `nvm install 22`).");
  const npm = run("npm", ["-v"]);
  add("tooling", "npm", npm ? OK : FAIL, npm ? `v${npm}` : "not found", npm ? "" : "Install npm (ships with node).");
  const py = run("python3", ["-c", "import sys;print(sys.version.split()[0])"]);
  if (!py) add("tooling", "python3 + Pillow", WARN, "python3 not found", "Install python3; Pillow is needed to build question figures.");
  else {
    const pil = run("python3", ["-c", "import PIL;print(PIL.__version__)"]);
    add("tooling", "python3 + Pillow", pil ? OK : WARN, pil ? `python ${py}, Pillow ${pil}` : `python ${py}, Pillow missing`, pil ? "" : "pip install --user pillow (bash scripts/setup.sh does this).");
  }
  const branch = run("git", ["-C", ROOT, "rev-parse", "--abbrev-ref", "HEAD"]);
  add("tooling", "git branch", branch ? OK : WARN, branch ?? "not a git checkout", "");
  add("tooling", "node_modules", exists(path.join(ROOT, "node_modules")) ? OK : FAIL, exists(path.join(ROOT, "node_modules")) ? "installed" : "missing", exists(path.join(ROOT, "node_modules")) ? "" : "Run `npm run setup`.");
  const reg = path.join(ROOT, "apps/mobile/assets/content/P6/figpacks/registry.ts");
  add("tooling", "figure packs", exists(reg) ? OK : FAIL, exists(reg) ? "built" : "registry.ts missing", exists(reg) ? "" : "Run `npm run setup` (apps/mobile postinstall builds them; needs python3 + Pillow).");

  const pwDirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers", path.join(os.homedir(), ".cache/ms-playwright"), path.join(os.homedir(), "Library/Caches/ms-playwright")].filter(Boolean);
  const pw = pwDirs.find((d) => { try { return fs.readdirSync(d).some((n) => /^chromium/.test(n)); } catch { return false; } });
  add("tooling", "Playwright chromium", pw ? OK : WARN, pw ? `in ${pw}` : "not found", pw ? "" : "bash scripts/setup.sh --browser (only needed for web preview screenshots/tests).");

  const jv = javaVersion();
  const jmajor = jv ? Number(jv.startsWith("1.") ? jv.split(".")[1] : jv.split(".")[0]) : 0;
  add("tooling", "java (JDK)", jv ? (jmajor >= 17 ? OK : WARN) : WARN, jv ? `${jv}` : "not found", jv && jmajor >= 17 ? "" : "JDK 17+ is needed only for Android APK builds.");

  const candidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, path.join(os.homedir(), "android-sdk")].filter(Boolean);
  const sdk = candidates.find((d) => exists(path.join(d, "cmdline-tools")) || exists(path.join(d, "platform-tools")));
  if (sdk) {
    const parts = ["platforms/android-36", "build-tools/36.0.0", "ndk/27.1.12297006"].filter((p) => !exists(path.join(sdk, p)));
    const envSet = !!(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT);
    add("tooling", "Android SDK", parts.length ? WARN : OK, `${sdk}${envSet ? "" : " (ANDROID_HOME not exported)"}${parts.length ? `; missing ${parts.join(", ")}` : ""}`,
      parts.length ? "bash scripts/setup.sh --android" : envSet ? "" : `export ANDROID_HOME=${sdk}`);
  } else add("tooling", "Android SDK", WARN, "not found", "bash scripts/setup.sh --android (only needed to build APKs).");
  const key = path.join(os.homedir(), ".android-signing/release.p12");
  add("tooling", "Android signing key", exists(key) ? OK : WARN, exists(key) ? "~/.android-signing/release.p12" : "not fetched", exists(key) ? "" : "node scripts/android-key.mjs (needs the Firebase service account).");
}

// ---------------- credentials (presence only) ----------------
let hasFirebase = false, hasNetlify = false;
{
  let email = null, source = null, parseErr = false;
  const tryParse = (txt, src) => { try { const j = JSON.parse(txt); if (j.client_email) { email = j.client_email; source = src; } else parseErr = true; } catch { parseErr = true; } };
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) tryParse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"), "FIREBASE_SERVICE_ACCOUNT_B64");
  else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) tryParse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, "FIREBASE_SERVICE_ACCOUNT_JSON");
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try { tryParse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"), "GOOGLE_APPLICATION_CREDENTIALS"); } catch { parseErr = true; source = "GOOGLE_APPLICATION_CREDENTIALS"; }
  }
  hasFirebase = !!email;
  const what = "content sync, editor writes, backend deploy, hosting deploy";
  if (email) add("credentials", "Firebase service account", OK, `${source} -> ${email}`, `Enables: ${what}.`);
  else if (parseErr) add("credentials", "Firebase service account", FAIL, `${source ?? "variable"} is set but not a valid service account`, "Re-export FIREBASE_SERVICE_ACCOUNT_B64 (base64 of the key JSON).");
  else add("credentials", "Firebase service account", WARN, "not set", `Set FIREBASE_SERVICE_ACCOUNT_B64 (or _JSON / GOOGLE_APPLICATION_CREDENTIALS) to enable: ${what}. Read-only work and tests need nothing.`);

  const nl = process.env.NETLIFY_AUTH_TOKEN ? "NETLIFY_AUTH_TOKEN" : process.env.NETLIFY_SECRET ? "NETLIFY_SECRET" : null;
  hasNetlify = !!nl;
  add("credentials", "Netlify token", nl ? OK : WARN, nl ? `${nl} set` : "not set", nl ? "Enables: backend + APK page deploys." : "Set NETLIFY_AUTH_TOKEN (or NETLIFY_SECRET) for backend and APK-page deploys.");
  add("credentials", "EXPO_TOKEN", process.env.EXPO_TOKEN ? OK : SKIP, process.env.EXPO_TOKEN ? "set (EAS CLI usable)" : "not set (optional)", process.env.EXPO_TOKEN ? "" : "Optional: only for the EAS CLI. The Expo connector/workflows can publish OTA updates instead.");
  add("credentials", "GitHub token", OK, "not needed", "git remote already works for push/pull.");
}

// ---------------- live status ----------------
const live = { backend: null, web: null, editor: null, ota: null, netlify: null, apk: null };
async function http(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(10000), redirect: "manual" });
  const text = await res.text().catch(() => "");
  return { status: res.status, text };
}
const guard = async (group, name, fn) => {
  try { await fn(); } catch (e) {
    const msg = e?.name === "TimeoutError" ? "timed out after 10 s" : (e?.cause?.code || e?.message || String(e));
    add(group, name, WARN, `request failed: ${msg}`, "Network problem or proxy; not fatal. Re-run later.");
  }
};
// Student Firebase project (two-project layout, in progress until the migration runs): shown only when configured.
{
  const sp = process.env.STUDENT_PROJECT_ID;
  const key = process.env.STUDENT_SETUP_SERVICE_ACCOUNT_B64 || process.env.STUDENT_SERVICE_ACCOUNT_B64;
  if (sp || key) {
    let who = "";
    try { who = JSON.parse(Buffer.from(key ?? "", "base64").toString("utf8")).project_id ?? ""; } catch { /* reported below */ }
    if (key && !who) add("credentials", "Student Firebase project", FAIL, "student service account variable is set but not a valid key", "Re-export STUDENT_SETUP_SERVICE_ACCOUNT_B64 / STUDENT_SERVICE_ACCOUNT_B64 (base64 of the key JSON).");
    else add("credentials", "Student Firebase project", OK, `${sp || who || "?"}${key ? ` (key for ${who})` : " (no key)"}; editor stays in primary-math-sg`, key ? "" : "Set STUDENT_SETUP_SERVICE_ACCOUNT_B64 to run the migration/setup scripts.");
  }
}
if (OFFLINE) {
  for (const n of ["backend API", "web app", "question editor", "OTA channel", "Netlify credits", "APK download page"]) add("live", n, SKIP, "skipped (--offline)", "");
} else {
  const appCfg = fs.readFileSync(path.join(ROOT, "apps/mobile/app.config.ts"), "utf8");
  const runtime = /^\s*version:\s*["'](\d+\.\d+\.\d+[^"']*)["']/m.exec(appCfg)?.[1] ?? null;
  await Promise.all([
    guard("live", "backend API", async () => {
      const r = await http("https://catapult-math-athletes-api.netlify.app/api/getLeaderboard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: { scope: "global" } }) });
      const unauth = r.status === 401 && /unauthenticated/i.test(r.text);
      live.backend = r.status;
      add("live", "backend API", unauth ? OK : FAIL, `getLeaderboard -> HTTP ${r.status}${unauth ? " unauthenticated (expected)" : ""}`, unauth ? "" : "Backend not answering as expected; see backend/README.md (deploy-netlify.mjs).");
    }),
    guard("live", "web app", async () => {
      const r = await http("https://catapult-mathletes.web.app"); live.web = r.status;
      add("live", "web app", r.status === 200 ? OK : FAIL, `HTTP ${r.status}`, r.status === 200 ? "" : "Web build not live; the GitHub Actions deploy may have failed.");
    }),
    guard("live", "question editor", async () => {
      const r = await http("https://primary-math-sg.web.app"); live.editor = r.status;
      add("live", "question editor", r.status === 200 ? OK : FAIL, `HTTP ${r.status}`, r.status === 200 ? "" : "Editor hosting not answering.");
    }),
    guard("live", "OTA channel", async () => {
      if (!runtime) return add("live", "OTA channel", WARN, "could not read version from app.config.ts", "");
      const r = await http("https://u.expo.dev/ea8a1c9d-c3dd-4cac-903d-78956443efe9", { headers: { "expo-platform": "android", "expo-runtime-version": runtime, "expo-channel-name": "preview", "expo-protocol-version": "1", accept: "multipart/mixed" } });
      live.ota = r.status;
      if (r.status === 200) add("live", "OTA channel", OK, `update available for runtime ${runtime} (preview)`, "");
      else add("live", "OTA channel", WARN, `runtime ${runtime}: HTTP ${r.status} ${r.text.replace(/\s+/g, " ").slice(0, 110)}`, "No update published for this runtime version yet; publish one (docs/ANDROID.md) after a build exists.");
    }),
    guard("live", "Netlify credits", async () => {
      if (!hasNetlify) return add("live", "Netlify credits", SKIP, "no Netlify token", "");
      const { netlifyBudget } = await import(pathToFileURL(path.join(ROOT, "backend/scripts/netlify-budget.mjs")).href);
      const b = await netlifyBudget();
      const used = b.plan - b.left; live.netlify = { used, plan: b.plan, left: b.left, reset: b.end };
      const reset = b.end ? String(b.end).slice(0, 10) : "?";
      add("live", "Netlify credits", b.left < 60 ? WARN : OK, `${used}/${b.plan} used (deploys only), ${b.left} left, resets ${reset}`, b.left < 60 ? "Fewer than 60 left: avoid backend/APK-page deploys until the reset." : "");
    }),
    guard("live", "APK download page", async () => {
      const r = await http("https://catapult-math-athletes-download.netlify.app"); live.apk = r.status;
      add("live", "APK download page", r.status === 401 ? OK : r.status === 200 ? OK : WARN, r.status === 401 ? "HTTP 401: team-only (archived)" : r.status === 200 ? "HTTP 200: public" : `HTTP ${r.status}`, r.status === 401 || r.status === 200 ? "" : "Unexpected status; check the Netlify site catapult-math-athletes-download.");
    }),
  ]);
}

const ORDER = ["backend API", "web app", "question editor", "OTA channel", "Netlify credits", "APK download page"];
checks.sort((x, y) => (x.group === "live" && y.group === "live" ? ORDER.indexOf(x.name) - ORDER.indexOf(y.name) : 0));

// ---------------- capabilities ----------------
const st = (n) => checks.find((c) => c.name === n)?.status;
const can = [];
const ready = st("node_modules") === OK;
can.push({ what: "run tests / typecheck (npm test)", ok: ready && st("node") === OK, need: "npm run setup" });
can.push({ what: "run the web preview (apps/mobile, expo start --web)", ok: ready && st("figure packs") === OK, need: "npm run setup" });
can.push({ what: "browser screenshots / e2e (Playwright)", ok: st("Playwright chromium") === OK, need: "bash scripts/setup.sh --browser" });
can.push({ what: "sync content from the editor Firestore", ok: hasFirebase, need: "Firebase service account" });
can.push({ what: "deploy the backend (Netlify functions + Firestore rules)", ok: hasFirebase && hasNetlify, need: "Firebase service account + Netlify token" });
can.push({ what: "deploy the web app by hand (normally GitHub Actions does it on push)", ok: hasFirebase, need: "Firebase service account" });
can.push({ what: "build a signed APK locally", ok: st("Android SDK") === OK && st("java (JDK)") === OK && (hasFirebase || st("Android signing key") === OK), need: "bash scripts/setup.sh --android" });

if (JSON_OUT) {
  console.log(JSON.stringify({ offline: OFFLINE, checks, can: can.map(({ what, ok, need }) => ({ what, ok, need: ok ? null : need })) }, null, 2));
  process.exit(0);
}
const w = Math.max(...checks.map((c) => c.name.length));
let group = "";
for (const c of checks) {
  if (c.group !== group) { group = c.group; console.log(`\n== ${group} ==`); }
  console.log(`${ICON[c.status]} ${c.name.padEnd(w)}  ${c.detail}`);
  if (c.todo) console.log(`   ${" ".repeat(w)}  -> ${c.todo}`);
}
console.log("\nYou can now:");
for (const c of can) console.log(`  ${c.ok ? "✅" : "❌"} ${c.what}${c.ok ? "" : `   (needs: ${c.need})`}`);
const bad = checks.filter((c) => c.status === FAIL).length, warn = checks.filter((c) => c.status === WARN).length;
console.log(`\n${bad} failing, ${warn} warnings.${OFFLINE ? " (offline: live checks skipped)" : ""}\n`);
