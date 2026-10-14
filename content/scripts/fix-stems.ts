// One-off: correct question stems in the editor bank (each change explained in the question's verification_notes).
//   npx tsx scripts/fix-stems.ts --dry   → shows the changes
//   npx tsx scripts/fix-stems.ts         → writes them; undo in content/reports/stem-fix-undo-<date>.json
import fs from "node:fs";
import { fetch as ufetch } from "undici";
import { accessToken, loadCredentials, makeDispatcher, fromFsFields } from "../src/sync";

const FIXES: Record<string, { from: string; to: string; note: string }> = {
  // The printed paper reads "+ 3" but every option fits "÷ 3": 99 = 49 + (27 − 2) × 2 (key), 63 = 49 + ((27 − 6) ÷ 3) × 2,
  // 148 = (49 + 25) × 2, 72 = 49 + 27 − 6 ÷ 3 × 2. With "+ 3" the value is 97, not an option (reported by a student).
  "2026_ACS_Junior_P1A_Q08": {
    from: "What is the value of 49 + (27 − 6 + 3) × 2?",
    to: "What is the value of 49 + (27 − 6 ÷ 3) × 2?",
    note: "FIXED 2026-10-14 (app): stem changed to (27 − 6 ÷ 3) so the official key 99 is correct; all distractors fit ÷ (63, 72, 148), the printed '+' gives 97 (no option).",
  },
};
const BASE = "https://firestore.googleapis.com/v1/projects/primary-math-sg/databases/default/documents/questions";
const DRY = process.argv.includes("--dry");

(async () => {
  const token = await accessToken(loadCredentials());
  const dispatcher = makeDispatcher();
  const undo: Record<string, unknown> = {};
  for (const [id, fix] of Object.entries(FIXES)) {
    const r = await ufetch(`${BASE}/${id}`, { headers: { Authorization: `Bearer ${token}` }, dispatcher });
    if (!r.ok) throw new Error(`${id}: ${r.status}`);
    const live = fromFsFields(((await r.json()) as { fields: never }).fields) as { question?: string; verification_notes?: string };
    if (live.question !== fix.from) { console.log(`skip ${id}: live stem is ${JSON.stringify(live.question)}`); continue; }
    undo[id] = { question: live.question, verification_notes: live.verification_notes ?? null };
    const notes = [live.verification_notes, fix.note].filter(Boolean).join("\n");
    console.log(`${DRY ? "would update" : "update"} ${id}:\n  ${fix.from}\n→ ${fix.to}`);
    if (DRY) continue;
    const fields = {
      question: { stringValue: fix.to },
      verification_notes: { stringValue: notes },
      last_edited_by: { stringValue: "app-stem-fix" },
      last_edited_at: { stringValue: new Date().toISOString() },
    };
    const mask = Object.keys(fields).map((m) => `updateMask.fieldPaths=${m}`).join("&");
    const u = await ufetch(`${BASE}/${id}?${mask}&currentDocument.exists=true`, { method: "PATCH", dispatcher, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
    if (!u.ok) throw new Error(`${id}: ${u.status} ${(await u.text()).slice(0, 200)}`);
  }
  if (!DRY && Object.keys(undo).length) fs.writeFileSync(`reports/stem-fix-undo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(undo, null, 1));
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
