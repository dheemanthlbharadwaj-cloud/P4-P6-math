#!/usr/bin/env node
// Fetch the Android release keystore so locally built APKs are signed with the production key.
//
// Source : Firestore project primary-math-sg, database "default", document app_secrets/android-signing
//          (fields keystore_p12_b64, password, alias, sha256). Read with the service account in
//          FIREBASE_SERVICE_ACCOUNT_B64 via backend/scripts/gcp.mjs.
// Output : ~/.android-signing/release.p12 and ~/.android-signing/store.pw (dir 0700, files 0600).
//          Prints only "ok" and the SHA-256 fingerprint. The password and key are never printed.
//
//   node scripts/android-key.mjs                       fetch + verify (keytool, when installed)
//   node scripts/android-key.mjs --gradle-props        print the -Pandroid.injected.signing.* arguments
//                                                      (password via $(cat ~/.android-signing/store.pw))
//   node scripts/android-key.mjs --write-gradle-props  write the same properties to ~/.gradle/gradle.properties
//                                                      (0600, between BEGIN/END catapult-signing markers)
//   node scripts/android-key.mjs --remove-gradle-props undo the above (remove that block)
//
// --gradle-props / --write-gradle-props / --remove-gradle-props work on an already fetched key and need no network.
// Remove the properties again after the build (docs/ANDROID.md, "Build a new APK").
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(os.homedir(), ".android-signing");
const P12 = path.join(DIR, "release.p12");
const PW = path.join(DIR, "store.pw");
const META = path.join(DIR, "meta.json"); // alias + sha256 only (not secret)
const GRADLE = path.join(os.homedir(), ".gradle", "gradle.properties");
const BEGIN = "# BEGIN catapult-signing (scripts/android-key.mjs)";
const END = "# END catapult-signing";
const args = new Set(process.argv.slice(2));

const readMeta = () => { try { return JSON.parse(fs.readFileSync(META, "utf8")); } catch { return null; } };
const stripBlock = (txt) => txt.replace(new RegExp(`\\n?${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END}\\n?`, "g"), "\n");

if (args.has("--help") || args.has("-h")) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
  process.exit(0);
}

if (args.has("--remove-gradle-props")) {
  if (fs.existsSync(GRADLE)) {
    const cur = fs.readFileSync(GRADLE, "utf8");
    const next = stripBlock(cur).replace(/\n{3,}/g, "\n\n");
    if (next !== cur) fs.writeFileSync(GRADLE, next.trim() ? next : "", { mode: 0o600 });
  }
  console.log("removed signing properties from " + GRADLE);
  process.exit(0);
}

if (args.has("--gradle-props") || args.has("--write-gradle-props")) {
  const meta = readMeta();
  if (!fs.existsSync(P12) || !fs.existsSync(PW) || !meta) { console.error("No key yet: run `node scripts/android-key.mjs` first."); process.exit(1); }
  if (args.has("--gradle-props")) {
    console.log([
      `-Pandroid.injected.signing.store.file=${P12}`,
      `-Pandroid.injected.signing.store.password="$(cat ${PW})"`,
      `-Pandroid.injected.signing.key.alias=${meta.alias}`,
      `-Pandroid.injected.signing.key.password="$(cat ${PW})"`,
    ].join(" "));
  } else {
    const pw = fs.readFileSync(PW, "utf8").trim();
    fs.mkdirSync(path.dirname(GRADLE), { recursive: true });
    const cur = fs.existsSync(GRADLE) ? stripBlock(fs.readFileSync(GRADLE, "utf8")).trimEnd() : "";
    const block = [BEGIN,
      `android.injected.signing.store.file=${P12}`, `android.injected.signing.store.password=${pw}`,
      `android.injected.signing.key.alias=${meta.alias}`, `android.injected.signing.key.password=${pw}`, END].join("\n");
    fs.writeFileSync(GRADLE, (cur ? cur + "\n\n" : "") + block + "\n", { mode: 0o600 });
    fs.chmodSync(GRADLE, 0o600);
    console.log("wrote signing properties to " + GRADLE + " (remove with --remove-gradle-props after the build)");
  }
  process.exit(0);
}

// ---- fetch ----
const { googleClient, loadServiceAccount } = await import(path.join(HERE, "..", "backend", "scripts", "gcp.mjs"));
let doc;
try {
  const sa = loadServiceAccount();
  const { api } = await googleClient(sa);
  const r = await api("GET", "https://firestore.googleapis.com/v1/projects/primary-math-sg/databases/default/documents/app_secrets/android-signing");
  if (r.status !== 200) throw new Error(`Firestore app_secrets/android-signing: HTTP ${r.status} ${r.error ?? ""}`);
  doc = r.body.fields ?? {};
} catch (e) {
  console.error("android-key: " + (e?.message ?? e));
  process.exit(1);
}
const f = (k) => doc[k]?.stringValue;
const p12b64 = f("keystore_p12_b64"), password = f("password"), alias = f("alias") || "catapult", expected = f("sha256");
if (!p12b64 || !password) { console.error("android-key: document is missing keystore_p12_b64 or password"); process.exit(1); }

fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
fs.chmodSync(DIR, 0o700);
fs.writeFileSync(P12, Buffer.from(p12b64, "base64"), { mode: 0o600 });
fs.writeFileSync(PW, password, { mode: 0o600 });
fs.chmodSync(P12, 0o600); fs.chmodSync(PW, 0o600);
fs.writeFileSync(META, JSON.stringify({ alias, sha256: expected ?? null }), { mode: 0o600 });

const norm = (s) => (s ?? "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
let fp = null;
try {
  const out = execFileSync("keytool", ["-list", "-v", "-keystore", P12, "-storetype", "PKCS12", "-storepass:file", PW], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  fp = /SHA-?256:\s*([0-9A-Fa-f:]+)/.exec(out)?.[1] ?? null;
} catch (e) {
  if (e.code !== "ENOENT") { console.error("android-key: keytool could not open the keystore (wrong password or corrupt file)"); process.exit(1); }
}
if (fp) {
  if (expected && norm(fp) !== norm(expected)) { console.error(`android-key: SHA-256 MISMATCH (keystore ${fp}, stored ${expected})`); process.exit(1); }
  console.log(`ok ${fp} (alias ${alias}) -> ${DIR}`);
} else {
  console.log(`ok (keytool not found, fingerprint not verified; stored sha256 ${expected ?? "n/a"}) -> ${DIR}`);
}
