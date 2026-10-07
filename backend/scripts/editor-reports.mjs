#!/usr/bin/env node
// Adds "Student reports" to the question bank editor (https://primary-math-sg.web.app): reports students send from
// the app (question_reports, written by the backend's reportQuestion) show on each question with Resolve / Dismiss,
// a ⚑ badge in the list and a "Student reports (open)" filter. The master sees all, volunteers their scope.
//
//   node backend/scripts/editor-reports.mjs [--dry]          patch the LIVE editor files and publish
//   node backend/scripts/editor-reports.mjs --restore <ver>  put a previous Hosting version back (undo)
//
// The editor's source lives outside this repo and is edited from other tools, so this script always starts from the
// files that are live right now, patches them (idempotent: an already patched editor is left alone) and publishes a
// new Hosting version that is a clone of the live one with only index.html and the new app.vN.js changed (the
// filename is bumped so browsers load it). The previous version is recorded in backend/reports/ for --restore.
// --dry writes the patched files to backend/reports/editor-preview/ only.
// Needs the setup service account (Firebase Hosting admin on primary-math-sg).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

export const MARKER = "/* student-reports v1";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SITE = process.env.EDITOR_SITE || "primary-math-sg";
const ORIGIN = `https://${SITE}.web.app`;
const HOSTING = "https://firebasehosting.googleapis.com/v1beta1";

function replaceOnce(src, find, replacement, what) {
  const hit = typeof find === "string" ? src.includes(find) : find.test(src);
  if (!hit) throw new Error(`editor changed, can't find: ${what}`);
  return src.replace(find, replacement);
}

/** The editor's app JS with the student-report additions. */
export function patchJs(js) {
  if (js.includes(MARKER)) return js;
  let s = js;
  s = replaceOnce(s, /\n\} from "(https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-firestore\.js)";/,
    '\n  updateDoc as __updateDoc,\n} from "$1";', "firestore import");
  s = replaceOnce(s, 'if (verify === "errors") list = list.filter(q => q.has_error || (q.error_log || "").trim());',
    'if (verify === "errors") list = list.filter(q => q.has_error || (q.error_log || "").trim());\n  if (verify === "reports") list = list.filter(q => __reportsByQ.has(q.id));', "errors filter");
  s = replaceOnce(s, `\${q.selected ? '<span class="badge sel">★ selected</span>' : ""}</div>`,
    `\${q.selected ? '<span class="badge sel">★ selected</span>' : ""}\${__reportBadge(q)}</div>`, "list badges");
  s = replaceOnce(s, '${escapeHtml(q.error_log || "")}</textarea>',
    '${escapeHtml(q.error_log || "")}</textarea>\n      <div id="reportsBox"></div>', "error log textarea");
  return `${s.replace(/\s*$/, "")}

/* ---------- student reports (question_reports, from the Catapult Math Athletes app) ---------- */
${MARKER}: added by backend/scripts/editor-reports.mjs in the p4-p6-math repo */
var __REPORT_REASONS = {
  "wrong-answer": "The answer is wrong", "marked-wrong": "Right answer was marked wrong", "unclear": "Unclear or has a typo",
  "figure": "Picture missing or wrong", "other": "Something else",
};
var __reports = new Map();    // reportId -> open report
var __reportsByQ = new Map(); // questionId -> [open reports]
function __reportBadge(q) {
  const n = (__reportsByQ.get(q.id) || []).length;
  return n ? \`<span class="badge rep">⚑ \${n} student report\${n > 1 ? "s" : ""}</span>\` : "";
}
function __listenReports() {
  __reports.clear(); __reportsByQ = new Map();
  const handle = snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === "removed") __reports.delete(ch.doc.id);
      else __reports.set(ch.doc.id, { id: ch.doc.id, ...ch.doc.data() });
    });
    __reportsByQ = new Map();
    for (const r of __reports.values()) {
      if (!__reportsByQ.has(r.question_id)) __reportsByQ.set(r.question_id, []);
      __reportsByQ.get(r.question_id).push(r);
    }
    renderList();
    __renderReportsBox();
  };
  const onErr = err => console.warn("student reports:", err.message);
  const reportsCol = collection(db, "question_reports");
  if (myRole === "master") unsubs.push(onSnapshot(query(reportsCol, where("status", "==", "open")), handle, onErr));
  else myKeys.forEach(k => unsubs.push(onSnapshot(query(reportsCol, where("access_key", "==", k), where("status", "==", "open")), handle, onErr)));
}
function __reportTime(t) {
  try { return t && t.toDate ? t.toDate().toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" }) : ""; } catch (e) { return ""; }
}
function __renderReportsBox() {
  const box = document.getElementById("reportsBox");
  if (!box) return;
  const secs = r => ((r.updated_at && r.updated_at.seconds) || 0);
  const list = ((currentId && __reportsByQ.get(currentId)) || []).slice().sort((a, b) => secs(b) - secs(a));
  if (!list.length) { box.innerHTML = ""; return; }
  box.innerHTML = \`<div class="reports-box"><div class="reports-title">⚑ Student reports (\${list.length} open)</div>\` + list.map(r => \`
    <div class="report" data-id="\${escapeHtml(r.id)}">
      <div class="report-reason">\${escapeHtml(__REPORT_REASONS[r.reason] || r.reason || "")}\${r.times_reported > 1 ? \` <span class="report-meta">· reported \${r.times_reported} times</span>\` : ""}</div>
      \${r.note ? \`<div class="report-note">“\${escapeHtml(r.note)}”</div>\` : ""}
      <div class="report-meta">\${r.answer_given ? \`Student's answer: <b>\${escapeHtml(r.answer_given)}</b> · \` : ""}\${escapeHtml(r.context || "")} · \${escapeHtml(r.grade || "")} · \${__reportTime(r.updated_at || r.created_at)}</div>
      <div class="report-actions">
        <input class="report-res" placeholder="What did you do? (optional)">
        <button class="btn small" data-act="resolved">✓ Resolved</button>
        <button class="btn small" data-act="dismissed">Dismiss</button>
      </div>
    </div>\`).join("") + "</div>";
  box.querySelectorAll(".report button").forEach(b => {
    b.onclick = async () => {
      const el = b.closest(".report");
      const note = el.querySelector(".report-res").value.trim();
      b.disabled = true;
      try {
        await __updateDoc(doc(db, "question_reports", el.dataset.id), {
          status: b.dataset.act, resolved_by: myName, resolved_at: serverTimestamp(), ...(note ? { resolution_note: note } : {}),
        });
        showToast(b.dataset.act === "resolved" ? "Report marked resolved" : "Report dismissed");
      } catch (e) {
        b.disabled = false;
        showToast("Couldn't update the report: " + e.message);
      }
    };
  });
}
var __renderEditorBase = renderEditor;
renderEditor = function () { __renderEditorBase.apply(this, arguments); __renderReportsBox(); };
var __startListeningBase = startListening;
startListening = function () { __startListeningBase.apply(this, arguments); __listenReports(); };
`;
}

const CSS = `
/* student reports (backend/scripts/editor-reports.mjs) */
.badge.rep{color:#b8860b;border-color:#b8860b}
.reports-box{margin-top:14px;border:1px solid #b8860b;border-radius:10px;padding:10px 14px;background:var(--panel2)}
.reports-title{font-weight:700;color:#b8860b;margin-bottom:6px}
.report{border-top:1px solid var(--border);padding:8px 0}
.report:first-of-type{border-top:none}
.report-reason{font-weight:600;font-size:13px}
.report-note{font-size:13px;margin-top:4px;white-space:pre-wrap}
.report-meta{font-size:11px;color:var(--muted);margin-top:3px}
.report-actions{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.report-actions .report-res{flex:1;min-width:160px}
`;

/** index.html: new script name, the filter option and the styles. */
export function patchHtml(html, oldJs, newJs) {
  let s = html;
  s = replaceOnce(s, `import("./${oldJs}")`, `import("./${newJs}")`, "app script import");
  if (!s.includes('value="reports"')) {
    s = replaceOnce(s, '<option value="errors">Errors flagged only</option>', '<option value="errors">Errors flagged only</option><option value="reports">Student reports (open)</option>', "verify filter");
  }
  if (!s.includes(".badge.rep")) s = replaceOnce(s, "</style>", `${CSS}</style>`, "styles");
  return s;
}

async function main() {
  const { googleClient, loadServiceAccount } = await import("./gcp.mjs");
  const DRY = process.argv.includes("--dry");
  const restoreAt = process.argv.indexOf("--restore");
  const { api, must, token } = await googleClient(loadServiceAccount());
  const release = async (versionName) => must(await api("POST", `${HOSTING}/sites/${SITE}/releases?versionName=${encodeURIComponent(versionName)}`, { message: "student reports" }), "release");

  if (restoreAt > 0) {
    const v = process.argv[restoreAt + 1];
    if (!v?.startsWith(`sites/${SITE}/versions/`)) throw new Error("--restore needs a version name from backend/reports/");
    await release(v);
    console.log(`restored ${SITE} → ${v}`);
    return;
  }

  // 1) Live files
  const get = async (p) => { const r = await fetch(`${ORIGIN}/${p}?t=${Date.now()}`, { cache: "no-store" }); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.text(); };
  const html = await get("index.html");
  const oldJs = html.match(/import\("\.\/(app\.v(\d+)\.js)"\)/);
  if (!oldJs) throw new Error("can't find the editor's app script in index.html");
  const js = await get(oldJs[1]);
  if (js.includes(MARKER)) { console.log(`editor already has student reports (${oldJs[1]})`); return; }
  const newJs = `app.v${Number(oldJs[2]) + 1}.js`;
  const files = { "/index.html": patchHtml(html, oldJs[1], newJs), [`/${newJs}`]: patchJs(js) };
  const preview = path.join(ROOT, "backend/reports/editor-preview");
  fs.mkdirSync(preview, { recursive: true });
  for (const [p, c] of Object.entries(files)) fs.writeFileSync(path.join(preview, p), c);
  console.log(`patched ${oldJs[1]} → ${newJs}; preview in backend/reports/editor-preview/`);
  if (DRY) { console.log("dry run: nothing published"); return; }

  // 2) New version = clone of the live one + the two files
  const live = must(await api("GET", `${HOSTING}/sites/${SITE}/releases?pageSize=1`), "releases").releases?.[0]?.version;
  if (!live?.name) throw new Error("no live release");
  let op = must(await api("POST", `${HOSTING}/sites/${SITE}/versions:clone`, { sourceVersion: live.name, finalize: false }), "clone version");
  for (let i = 0; !op.done && i < 60; i++) { await new Promise((r) => setTimeout(r, 2000)); op = must(await api("GET", `${HOSTING}/${op.name}`), "clone operation"); }
  if (!op.done || op.error) throw new Error(`clone failed: ${op.error?.message ?? "timeout"}`);
  const version = op.response.name;
  const gz = Object.fromEntries(Object.entries(files).map(([p, c]) => [p, zlib.gzipSync(Buffer.from(c))]));
  const hashes = Object.fromEntries(Object.entries(gz).map(([p, b]) => [p, crypto.createHash("sha256").update(b).digest("hex")]));
  const pop = must(await api("POST", `${HOSTING}/${version}:populateFiles`, { files: hashes }), "populate files");
  for (const h of pop.uploadRequiredHashes ?? []) {
    const p = Object.keys(hashes).find((k) => hashes[k] === h);
    const r = await fetch(`${pop.uploadUrl}/${h}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: gz[p] });
    if (!r.ok) throw new Error(`upload ${p}: HTTP ${r.status}`);
  }
  must(await api("PATCH", `${HOSTING}/${version}?update_mask=status`, { status: "FINALIZED" }), "finalize");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(ROOT, `backend/reports/editor-hosting-${stamp}.json`), JSON.stringify({ site: SITE, previousVersion: live.name, newVersion: version, undo: `node backend/scripts/editor-reports.mjs --restore ${live.name}` }, null, 2) + "\n");
  await release(version);
  console.log(`published ${version} (previous ${live.name} recorded in backend/reports/)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
