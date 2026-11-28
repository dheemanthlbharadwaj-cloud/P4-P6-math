#!/usr/bin/env node
// Imports the extracted P3 questions into the editor project's OWN collection `questions_p3` (owner decision 26 Nov 2026;
// the P6 `questions` collection and the game's sync are not touched).
//
//   node content/extract-p3/import.mjs --pdfs <dir with {year}-P3-Maths-EOY-{School}.pdf> [--dry]
//
// 1. Cloudinary (signed REST, resumable via output/cloudinary_map.json): figures → p6maths/p3/figures/<id> (image),
//    source PDFs → p6maths/p3/pdfs/<year>-P3-Maths-EOY-<School>.pdf (raw).
// 2. Builds bank records from output/<paper>/questions.json (papers in output/duplicates.json are skipped) with the bank's
//    audit fields: difficulty (MCQ → LV1; multi-part or multi-topic → LV3; else LV2), access_key = topic|difficulty,
//    figure {required, filename} + figure_url (a figure_ref question uses the referenced crop), source_pdf_url,
//    paper (the printed section), calculator_allowed false, verified false, last_edited_by "p3-import".
// 3. Writes with Firestore REST commits of ≤ 400 creates; every write has the precondition "document does not exist",
//    so nothing already in questions_p3 is ever overwritten. Undo manifest (ids written) → content/reports/.
// --dry: no Cloudinary uploads, no writes; prints counts, a sample record and any existing-id collisions.
// Credentials: FIREBASE_SERVICE_ACCOUNT_B64 (editor project), CLOUDINARY_SECRET. Never prints secrets.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { googleClient, loadServiceAccount } from "../../backend/scripts/gcp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "output");
const ROOT = path.join(HERE, "..", "..");
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const PDFS = args.includes("--pdfs") ? args[args.indexOf("--pdfs") + 1] : null;
const COLLECTION = "questions_p3";
const DB = "https://firestore.googleapis.com/v1/projects/primary-math-sg/databases/default/documents";
const CLOUD = "n9gn4u6k";
const CKEY = process.env.CLOUDINARY_KEY ?? "465242564664612";
const CSECRET = process.env.CLOUDINARY_SECRET ?? "";
const MAP_FILE = path.join(OUT, "cloudinary_map.json");

if (!PDFS) throw new Error("usage: import.mjs --pdfs <dir> [--dry]");
if (!DRY && !CSECRET) throw new Error("set CLOUDINARY_SECRET");

// ---------- records ----------
const dropped = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(OUT, "duplicates.json"), "utf8")).dropped));
const papers = fs.readdirSync(OUT).filter((d) => /^\d{4}_/.test(d) && !dropped.has(d) && fs.existsSync(path.join(OUT, d, "questions.json")));
const level = (q) => q.question_type === "mcq" ? "LV1"
  : ((q.question_parts?.length ?? 0) > 1 || (q.topics?.length ?? 1) > 1) ? "LV3" : "LV2";
const pdfName = (paper) => { const [y, s] = [paper.slice(0, 4), paper.slice(5)]; return `${y}-P3-Maths-EOY-${s}.pdf`; };

const map = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) : { figures: {}, pdfs: {} };
const saveMap = () => fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 1));

async function cloudUpload(file, publicId, kind) {
  const ts = Math.floor(Date.now() / 1000);
  const toSign = `overwrite=true&public_id=${publicId}&timestamp=${ts}`;
  const signature = crypto.createHash("sha1").update(toSign + CSECRET).digest("hex");
  for (let attempt = 1; attempt <= 5; attempt++) {
    const fd = new FormData();
    fd.set("file", new Blob([fs.readFileSync(file)]), path.basename(file));
    fd.set("api_key", CKEY); fd.set("timestamp", String(ts)); fd.set("public_id", publicId); fd.set("overwrite", "true"); fd.set("signature", signature);
    try {
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${kind}/upload`, { method: "POST", body: fd });
      const j = await r.json();
      if (j.secure_url) return j.secure_url;
      throw new Error(j.error?.message ?? `HTTP ${r.status}`);
    } catch (e) {
      if (attempt === 5) throw new Error(`upload ${publicId}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 1500 * attempt));
    }
  }
}

const now = new Date().toISOString();
const records = [];
const figureJobs = [], pdfJobs = [];
for (const paper of papers) {
  const qs = JSON.parse(fs.readFileSync(path.join(OUT, paper, "questions.json"), "utf8"));
  const pdf = pdfName(paper);
  if (!map.pdfs[pdf]) pdfJobs.push(pdf);
  for (const q of qs) {
    const figId = q.has_figure ? (q.figure_ref || q.id) : null;
    const figFile = figId ? path.join(OUT, paper, "figures", `${figId}.png`) : null;
    if (figId && !fs.existsSync(figFile)) throw new Error(`${q.id}: figure file missing (${figId}.png)`);
    if (figId && !map.figures[figId] && !figureJobs.some((j) => j.id === figId)) figureJobs.push({ id: figId, file: figFile });
    const difficulty = level(q);
    const { ocr_fixes, checked_against_image, confidence, answer_check, figure_note, ...keep } = q;
    records.push({
      ...keep,
      topic_primaries: q.topics?.length ? q.topics : [q.topic_primary],
      multitopic: (q.topics?.length ?? 1) > 1,
      difficulty, access_key: `${q.topic_primary}|${difficulty}`,
      paper: q.section ? `Section ${q.section}`.replace(/^Section (Booklet|Paper|Section)/, "$1") : null,
      calculator_allowed: false,
      figure: { required: !!figId, filename: figId ? `${figId}.png` : null },
      figure_url: null, source_pdf: pdf, source_pdf_url: null,
      verified: false, verified_by: null, has_error: false,
      last_edited_by: "p3-import", last_edited_at: now,
      verification_notes: `extraction: confidence ${confidence ?? "?"}; ${answer_check ?? ""}`.slice(0, 500),
      _fig: figId, _pdf: pdf,
    });
  }
}
const ids = records.map((r) => r.id);
if (new Set(ids).size !== ids.length) throw new Error("duplicate ids in the import set");

const sa = loadServiceAccount();
const { api } = await googleClient(sa);
// existing docs in questions_p3 (should be none on the first import)
const existing = new Set();
let tok = "";
do {
  const r = await api("GET", `${DB}/${COLLECTION}?pageSize=1000&mask.fieldPaths=id${tok ? `&pageToken=${tok}` : ""}`);
  if (r.status >= 300) throw new Error(`list ${COLLECTION}: HTTP ${r.status} ${r.error ?? ""}`);
  for (const d of r.body.documents ?? []) existing.add(d.name.split("/").pop());
  tok = r.body.nextPageToken ?? "";
} while (tok);
const collisions = ids.filter((i) => existing.has(i));

console.log(JSON.stringify({ papers: papers.length, questions: records.length, with_figure: records.filter((r) => r._fig).length,
  figures_to_upload: figureJobs.length, pdfs_to_upload: pdfJobs.length, existing_in_collection: existing.size, collisions: collisions.length,
  by_level: records.reduce((a, r) => ((a[r.difficulty] = (a[r.difficulty] ?? 0) + 1), a), {}) }));
if (DRY) {
  const s = { ...records.find((r) => r._fig) }; delete s._fig; delete s._pdf;
  console.log("sample:", JSON.stringify(s).slice(0, 900));
  console.log("dry run: nothing uploaded or written");
  process.exit(0);
}
if (collisions.length) throw new Error(`refusing: ${collisions.length} ids already exist in ${COLLECTION} (e.g. ${collisions[0]})`);

// ---------- uploads ----------
for (const pdf of pdfJobs) {
  const file = path.join(PDFS, pdf);
  if (!fs.existsSync(file)) throw new Error(`source PDF missing: ${file}`);
  map.pdfs[pdf] = await cloudUpload(file, `p6maths/p3/pdfs/${pdf}`, "raw"); saveMap();
  console.log("pdf", pdf);
}
let n = 0;
for (const j of figureJobs) {
  map.figures[j.id] = await cloudUpload(j.file, `p6maths/p3/figures/${j.id}`, "image"); saveMap();
  if (++n % 50 === 0) console.log(`figures ${n}/${figureJobs.length}`);
  await new Promise((res) => setTimeout(res, 150));
}

// ---------- Firestore ----------
const toFs = (v) => v === null || v === undefined ? { nullValue: null }
  : typeof v === "boolean" ? { booleanValue: v }
  : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === "string" ? { stringValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(toFs) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
const written = [];
const undoFile = path.join(ROOT, "content", "reports", `p3-import-undo-${Date.now()}.json`);
for (let i = 0; i < records.length; i += 400) {
  const chunk = records.slice(i, i + 400).map((r) => {
    const { _fig, _pdf, ...doc } = r;
    doc.figure_url = _fig ? map.figures[_fig] : null;
    doc.source_pdf_url = map.pdfs[_pdf] ?? null;
    return doc;
  });
  const writes = chunk.map((doc) => ({
    update: { name: `projects/primary-math-sg/databases/default/documents/${COLLECTION}/${doc.id}`, fields: toFs(doc).mapValue.fields },
    currentDocument: { exists: false },
  }));
  const r = await api("POST", `${DB}:commit`, { writes });
  if (r.status >= 300) throw new Error(`commit at ${i}: HTTP ${r.status} ${r.error ?? ""}`);
  written.push(...chunk.map((d) => d.id));
  fs.writeFileSync(undoFile, JSON.stringify({ collection: COLLECTION, undo: "delete these documents", ids: written }, null, 1));
  console.log(`written ${written.length}/${records.length}`);
}
console.log(`done. undo manifest: ${path.relative(ROOT, undoFile)}`);
