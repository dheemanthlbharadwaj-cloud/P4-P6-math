// Publish a built web folder to Firebase Hosting (REST API, no Firebase CLI login needed).
//
//   cd content && npx tsx ../apps/mobile/scripts/deploy-hosting.ts <dir> [siteId] [projectId]
//
// Credentials: the same service account the content sync uses (FIREBASE_SERVICE_ACCOUNT_B64 / _JSON); it needs the
// "Firebase Hosting Admin" role on the project. Creates the site on first use. Every path falls back to index.html
// (single-page app).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { JWT } from "google-auth-library";
import { fetch as ufetch } from "undici";
import { loadCredentials, makeDispatcher } from "../../../content/src/sync";

const [dir, siteId = "catapult-math-athletes", project = "primary-math-sg"] = process.argv.slice(2);
const API = "https://firebasehosting.googleapis.com/v1beta1";

async function main() {
  if (!dir || !fs.existsSync(dir)) throw new Error(`usage: deploy-hosting.ts <dir> [siteId] [projectId] (dir not found: ${dir})`);
  const sa = loadCredentials();
  const dispatcher = makeDispatcher();
  const jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const token = (await jwt.authorize()).access_token!;
  const call = async (method: string, url: string, body?: unknown) => {
    const r = await ufetch(url, { method, dispatcher, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) throw Object.assign(new Error(`${method} ${url} → ${r.status} ${text.slice(0, 400)}`), { status: r.status });
    return text ? JSON.parse(text) : {};
  };

  // 1. site (create once)
  try { await call("GET", `${API}/projects/${project}/sites/${siteId}`); }
  catch (e) {
    if ((e as { status?: number }).status !== 404) throw e;
    await call("POST", `${API}/projects/${project}/sites?siteId=${siteId}`, {});
    console.log("created site", siteId);
  }
  const site = `sites/${siteId}`;

  // 2. new version with SPA rewrite and cache headers
  const version = await call("POST", `${API}/${site}/versions`, {
    config: {
      rewrites: [{ glob: "**", path: "/index.html" }],
      headers: [
        { glob: "**/*.@(js|webp|png|ttf|json)", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
        { glob: "/", headers: { "Cache-Control": "no-cache" } },
        { glob: "**/*.html", headers: { "Cache-Control": "no-cache" } },
      ],
    },
  });

  // 3. files: gzip, hash, tell Hosting, upload the ones it doesn't have
  const files: Record<string, string> = {};
  const blobs = new Map<string, Buffer>();
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else {
        const gz = zlib.gzipSync(fs.readFileSync(p), { level: 9 });
        const hash = crypto.createHash("sha256").update(gz).digest("hex");
        files["/" + path.relative(dir, p).split(path.sep).join("/")] = hash;
        blobs.set(hash, gz);
      }
    }
  };
  walk(dir);
  const pop = await call("POST", `${API}/${version.name}:populateFiles`, { files });
  const need: string[] = pop.uploadRequiredHashes ?? [];
  console.log(`${Object.keys(files).length} files, uploading ${need.length}`);
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < need.length) {
      const h = need[i++];
      for (let attempt = 0; ; attempt++) {
        const r = await ufetch(`${pop.uploadUrl}/${h}`, { method: "POST", dispatcher, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: blobs.get(h) });
        if (r.ok) break;
        if (attempt >= 4) throw new Error(`upload ${h} → ${r.status} ${(await r.text()).slice(0, 200)}`);
        await new Promise((res) => setTimeout(res, 800 * 2 ** attempt));
      }
    }
  }));

  // 4. finalize + release
  await call("PATCH", `${API}/${version.name}?update_mask=status`, { status: "FINALIZED" });
  await call("POST", `${API}/${site}/releases?versionName=${version.name}`, { message: "web app" });
  console.log(`live: https://${siteId}.web.app`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
