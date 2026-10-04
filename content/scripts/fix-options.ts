// One-off: correct OCR-garbled MCQ options in the editor bank (checked against the source papers).
//   npx tsx scripts/fix-options.ts            → writes content/reports/option-fix-undo-<date>.json
import fs from "node:fs";
import { fetch as ufetch } from "undici";
import { accessToken, loadCredentials, makeDispatcher, fromFsFields } from "../src/sync";

const FIXES: Record<string, Record<string, string>> = {
  "2021_Henry_Park_P1A_Q08": { "1": "32π cm²", "2": "16π cm²", "3": "8π cm²", "4": "4π cm²" },
  "2021_PeiHwa_P1A_Q12": { "1": "(49π − 49) cm²", "2": "(49π − 98) cm²", "3": "(196π − 98) cm²", "4": "(196π − 196) cm²" },
};
const BASE = "https://firestore.googleapis.com/v1/projects/primary-math-sg/databases/default/documents/questions";

(async () => {
  const token = await accessToken(loadCredentials());
  const dispatcher = makeDispatcher();
  const undo: Record<string, unknown> = {};
  for (const [id, options] of Object.entries(FIXES)) {
    const r = await ufetch(`${BASE}/${id}`, { headers: { Authorization: `Bearer ${token}` }, dispatcher });
    if (!r.ok) throw new Error(`${id}: ${r.status}`);
    undo[id] = (fromFsFields(((await r.json()) as { fields: never }).fields) as { options?: unknown }).options;
    const fields = {
      options: { mapValue: { fields: Object.fromEntries(Object.entries(options).map(([k, v]) => [k, { stringValue: v }])) } },
      last_edited_by: { stringValue: "app-option-fix" },
      last_edited_at: { stringValue: new Date().toISOString() },
    };
    const mask = Object.keys(fields).map((m) => `updateMask.fieldPaths=${m}`).join("&");
    const u = await ufetch(`${BASE}/${id}?${mask}&currentDocument.exists=true`, { method: "PATCH", dispatcher, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
    if (!u.ok) throw new Error(`${id}: ${u.status} ${(await u.text()).slice(0, 200)}`);
    console.log("updated", id);
  }
  fs.writeFileSync(`reports/option-fix-undo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(undo, null, 1));
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
