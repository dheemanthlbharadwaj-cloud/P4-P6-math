#!/usr/bin/env node
// Turns the OLD web address (catapult-math-athletes.web.app, before the 29 Oct 2026 rename) into a permanent redirect to
// the new one (catapult-mathletes.web.app), keeping the path and query: /level/P6/x?mock=1 → https://catapult-mathletes.web.app/level/P6/x?mock=1.
// Run ONCE, only after the new site is live (deploy-web.yml) and the backend accepts its origin (deploy-netlify.mjs).
// The old site serves no files after this (the redirect answers everything), so it costs almost no Hosting transfer.
//
//   node backend/scripts/redirect-old-site.mjs [--dry]
// Needs FIREBASE_SERVICE_ACCOUNT_B64 (Hosting Admin on primary-math-sg). Never prints secrets.
import { googleClient, loadServiceAccount } from "./gcp.mjs";

const OLD = "catapult-math-athletes";
const NEW_URL = "https://catapult-mathletes.web.app";
const DRY = process.argv.includes("--dry");
const H = "https://firebasehosting.googleapis.com/v1beta1";
const must = (r, what) => { if (r.status >= 300) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`); return r.body; };

const { api } = await googleClient(loadServiceAccount());
const config = { redirects: [{ regex: "^/(?P<path>.*)$", location: `${NEW_URL}/:path`, statusCode: 301 }] };
console.log(`${OLD}.web.app → ${NEW_URL} (301, path and query kept)`);
const check = await fetch(NEW_URL + "/");
if (!check.ok) throw new Error(`refusing: ${NEW_URL} answers HTTP ${check.status}; deploy the new site first`);
if (DRY) { console.log("dry run: nothing changed"); process.exit(0); }
const ver = must(await api("POST", `${H}/sites/${OLD}/versions`, { config }), "create version");
must(await api("PATCH", `${H}/${ver.name}?update_mask=status`, { status: "FINALIZED" }), "finalize");
must(await api("POST", `${H}/sites/${OLD}/releases?versionName=${ver.name}`, { message: "redirect to " + NEW_URL }), "release");
console.log(`released ${ver.name}`);
