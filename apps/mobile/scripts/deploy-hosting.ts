// Publish a built web folder to Firebase Hosting (REST API, no Firebase CLI login needed).
//
//   cd content && npx tsx ../apps/mobile/scripts/deploy-hosting.ts <dir> [siteId] [projectId]
//
// Credentials: GOOGLE_OAUTH_ACCESS_TOKEN (CI: .github/workflows/deploy-web.yml), else the same service account the content
// sync uses (FIREBASE_SERVICE_ACCOUNT_B64 / _JSON); it needs the
// "Firebase Hosting Admin" role on the project. Creates the site on first use. Every path falls back to index.html
// (single-page app).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { JWT } from "google-auth-library";
import { fetch as ufetch } from "undici";
import { loadCredentials, makeDispatcher } from "../../../content/src/sync";

const [dir, siteId = "catapult-mathletes", project = "primary-math-sg"] = process.argv.slice(2);
const API = "https://firebasehosting.googleapis.com/v1beta1";

async function main() {
  if (!dir || !fs.existsSync(dir)) throw new Error(`usage: deploy-hosting.ts <dir> [siteId] [projectId] (dir not found: ${dir})`);
  const dispatcher = makeDispatcher();
  // CI (GitHub Actions, keyless workload identity federation) passes a short-lived token; locally the service account.
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || (await (async () => {
    const sa = loadCredentials();
    const jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
    return (await jwt.authorize()).access_token!;
  })());
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
        // Security headers on everything: no framing (clickjacking), no MIME sniffing, no referrer details to other
        // sites, no camera/mic/location, HTTPS only. (No Cross-Origin-Opener-Policy: Google sign-in uses a popup.)
        {
          glob: "**",
          headers: {
            "Content-Security-Policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
          },
        },
        // Every path is index.html through the rewrite (deep links like /level/P6/...), and index.html must never be
        // cached: a stale copy would point at a bundle the next deploy removed. Later rules win, so the hashed
        // files below override this. Only those folders/names get the long cache: a missing file falls back to
        // index.html and must not be remembered for a year.
        { glob: "**", headers: { "Cache-Control": "no-cache" } },
        { glob: "/js/**", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
        { glob: "/assets/**", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
        { glob: "/figures-*", headers: { "Cache-Control": "public, max-age=31536000, immutable" } },
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
