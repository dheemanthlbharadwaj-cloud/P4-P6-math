// Apply re-cropped figures to the editor's question bank.
//
//   npx tsx scripts/apply-recrops.ts <dir-of-pngs> [--dry]
//
// Each <questionId>.png in the folder is uploaded to Cloudinary (p6maths/figures_edited/<id>_recrop) and the
// question's figure_url is pointed at it, stamped last_edited_by = "app-recrop". Before writing, every target doc is
// re-read live; an undo manifest (old/new figure_url per doc) is written next to the images.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fetch as ufetch, FormData } from "undici";
import { accessToken, loadCredentials, makeDispatcher, fromFsFields } from "../src/sync";

const [dir, flag] = process.argv.slice(2);
const DRY = flag === "--dry";
const CLOUD = "n9gn4u6k";
const KEY = process.env.CLOUDINARY_KEY ?? "465242564664612";
const SECRET = process.env.CLOUDINARY_SECRET ?? "";
const BASE = "https://firestore.googleapis.com/v1/projects/primary-math-sg/databases/default/documents/questions";

async function main() {
  if (!SECRET) throw new Error("set CLOUDINARY_SECRET");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
  const sa = loadCredentials();
  const token = await accessToken(sa);
  const dispatcher = makeDispatcher();
  const manifest: { id: string; old: string | null; new: string }[] = [];
  for (const f of files) {
    const id = f.replace(/\.png$/, "");
    const r = await ufetch(`${BASE}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, dispatcher });
    if (!r.ok) { console.log("SKIP (not found live)", id, r.status); continue; }
    const live = fromFsFields(((await r.json()) as { fields: never }).fields) as { figure_url?: string };
    if (DRY) { console.log("would update", id, "from", live.figure_url); continue; }
    // signed upload
    const ts = Math.floor(Date.now() / 1000);
    const publicId = `p6maths/figures_edited/${id}_recrop`;
    const toSign = `overwrite=true&public_id=${publicId}&timestamp=${ts}`;
    const signature = crypto.createHash("sha1").update(toSign + SECRET).digest("hex");
    const fd = new FormData();
    fd.set("file", new Blob([fs.readFileSync(path.join(dir, f))], { type: "image/png" }), f);
    fd.set("api_key", KEY); fd.set("timestamp", String(ts)); fd.set("public_id", publicId); fd.set("overwrite", "true"); fd.set("signature", signature);
    const up = await ufetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/upload`, { method: "POST", body: fd, dispatcher });
    const upj = (await up.json()) as { secure_url?: string; error?: { message: string } };
    if (!upj.secure_url) throw new Error(`upload ${id}: ${upj.error?.message}`);
    // targeted update: figure_url + audit fields only
    const now = new Date().toISOString();
    const body = { fields: { figure_url: { stringValue: upj.secure_url }, last_edited_by: { stringValue: "app-recrop" }, last_edited_at: { stringValue: now } } };
    const mask = ["figure_url", "last_edited_by", "last_edited_at"].map((m) => `updateMask.fieldPaths=${m}`).join("&");
    const u = await ufetch(`${BASE}/${encodeURIComponent(id)}?${mask}&currentDocument.exists=true`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), dispatcher });
    if (!u.ok) throw new Error(`update ${id}: ${u.status} ${(await u.text()).slice(0, 300)}`);
    manifest.push({ id, old: live.figure_url ?? null, new: upj.secure_url });
    console.log("updated", id);
  }
  if (!DRY) fs.writeFileSync(path.join(dir, `undo-${Date.now()}.json`), JSON.stringify(manifest, null, 1));
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
