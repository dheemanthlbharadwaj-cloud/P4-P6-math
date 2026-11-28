#!/usr/bin/env node
// Live checks after the P3 import (read-only; ~1,700 Firestore reads per run).
//
//   node content/extract-p3/check_live.mjs [--rounds N]
//
// Each round: (1) every record in output/*/questions.json exists in questions_p3 and its content fields match exactly,
// and nothing extra is in the collection; (2) every figure_url / source_pdf_url answers 200 with the right content type
// (image / pdf) and a figure_ref question shows the referenced crop; (3) bank invariants: access_key = topic|difficulty,
// difficulty rule, grade P3; (4) the P6 `questions` collection still has no P3 ids and the same count as before.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { googleClient, loadServiceAccount } from "../../backend/scripts/gcp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "output");
const DB = "https://firestore.googleapis.com/v1/projects/primary-math-sg/databases/default/documents";
const ROUNDS = process.argv.includes("--rounds") ? Number(process.argv[process.argv.indexOf("--rounds") + 1]) : 1;
const P6_COUNT = 3547; // the P6 bank before the P3 work (26 Sep 2026 count, unchanged since)
const FIELDS = ["question", "question_parts", "options", "answer_key", "answer", "unit", "answer_parts", "topic_primary", "topics",
  "question_no", "marks", "question_type", "section", "year", "school", "source_pdf_page", "has_figure", "figure_ref", "answer_type"];

const fromFs = (v) => v.nullValue !== undefined ? null : v.booleanValue ?? v.stringValue ?? (v.integerValue !== undefined ? Number(v.integerValue) : undefined)
  ?? v.doubleValue ?? (v.arrayValue ? (v.arrayValue.values ?? []).map(fromFs) : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, fromFs(x)])) : null);
const norm = (x) => JSON.stringify(x ?? null);

const dropped = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(OUT, "duplicates.json"), "utf8")).dropped));
const local = {};
for (const d of fs.readdirSync(OUT)) {
  if (!/^\d{4}_/.test(d) || dropped.has(d)) continue;
  for (const q of JSON.parse(fs.readFileSync(path.join(OUT, d, "questions.json"), "utf8"))) local[q.id] = q;
}
const { api } = await googleClient(loadServiceAccount());
async function listAll(coll, mask) {
  const out = {}; let tok = "";
  do {
    const r = await api("GET", `${DB}/${coll}?pageSize=1000${mask ? mask.map((m) => `&mask.fieldPaths=${m}`).join("") : ""}${tok ? `&pageToken=${tok}` : ""}`);
    if (r.status >= 300) throw new Error(`list ${coll}: HTTP ${r.status}`);
    for (const d of r.body.documents ?? []) out[d.name.split("/").pop()] = fromFs({ mapValue: { fields: d.fields ?? {} } });
    tok = r.body.nextPageToken ?? "";
  } while (tok);
  return out;
}
const urlOk = new Map();
async function check(url, want) {
  if (urlOk.has(url)) return urlOk.get(url);
  let ok = false;
  for (let i = 0; i < 3 && !ok; i++) {
    try { const r = await fetch(url, { method: "HEAD" }); ok = r.ok && (r.headers.get("content-type") ?? "").includes(want); } catch { /* retry */ }
  }
  urlOk.set(url, ok); return ok;
}

for (let round = 1; round <= ROUNDS; round++) {
  const problems = [];
  const live = await listAll("questions_p3");
  for (const [id, q] of Object.entries(local)) {
    const d = live[id];
    if (!d) { problems.push(`${id}: missing in questions_p3`); continue; }
    for (const f of FIELDS) if (norm(q[f]) !== norm(d[f])) problems.push(`${id}: field ${f} differs`);
    const lvl = q.question_type === "mcq" ? "LV1" : ((q.question_parts?.length ?? 0) > 1 || (q.topics?.length ?? 1) > 1) ? "LV3" : "LV2";
    if (d.difficulty !== lvl || d.access_key !== `${d.topic_primary}|${d.difficulty}` || d.grade !== "P3") problems.push(`${id}: level/access_key/grade`);
    if (q.has_figure) {
      const ref = q.figure_ref || q.id;
      if (!d.figure_url || !d.figure_url.includes(`p6maths/p3/figures/${ref}`)) problems.push(`${id}: figure_url wrong (${d.figure_url})`);
      else if (!(await check(d.figure_url, "image"))) problems.push(`${id}: figure_url not reachable`);
    } else if (d.figure_url) problems.push(`${id}: has figure_url but has_figure false`);
    if (!d.source_pdf_url || !(await check(d.source_pdf_url, "pdf"))) problems.push(`${id}: source_pdf_url not reachable`);
  }
  for (const id of Object.keys(live)) if (!local[id]) problems.push(`${id}: extra doc in questions_p3`);
  const p6 = await listAll("questions", ["id"]);
  const p3inP6 = Object.keys(p6).filter((i) => i.includes("_P3_"));
  if (p3inP6.length) problems.push(`P6 bank contains ${p3inP6.length} P3 ids`);
  if (Object.keys(p6).length !== P6_COUNT) problems.push(`P6 bank count ${Object.keys(p6).length} (expected ${P6_COUNT})`);
  console.log(`round ${round}: ${Object.keys(live).length} live / ${Object.keys(local).length} local, ${urlOk.size} urls checked, P6 ${Object.keys(p6).length} — ${problems.length} problem(s)`);
  for (const p of problems.slice(0, 30)) console.log("  " + p);
  if (problems.length) process.exitCode = 1;
}
