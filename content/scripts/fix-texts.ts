// One-off: correct question texts that don't match the source papers (checked against the scans, answers re-checked).
//   npx tsx scripts/fix-texts.ts --dry   → prints what would change
//   npx tsx scripts/fix-texts.ts         → writes content/reports/text-fix-undo-<date>.json
import fs from "node:fs";
import { fetch as ufetch } from "undici";
import { accessToken, loadCredentials, makeDispatcher, fromFsFields } from "../src/sync";

type Part = { part: string; text: string };
type Fix = { question?: string; question_parts?: Part[]; excluded?: boolean; excluded_reason?: string; why: string };

const FIXES: Record<string, Fix> = {
  // Paper: "Glynis spent $11 more than Levivia" (answer 29.40 only works with $11); the cap's price was missing.
  "2023_St Nicholas_P2_Q6": {
    why: "$14 → $11 (paper), cap price added",
    question: "The table shows the prices of 5 items: Cap ＄4.00, Towel ＄0.90, Haversack ＄8.90, Water bottle ＄17.50, Sleeping bag ＄16.50. Of the 5 items, Glynis bought 3 of them and Levivia bought the remaining 2 items. The items each of them bought were different. Glynis spent ＄11 more than Levivia.",
  },
  // Paper's table counts fans per household, not children; statements reworded to match (answers unchanged).
  "2021_NANCHIAU_P1_Q29": {
    why: "children → fans, statements as on the paper",
    question: "The table below shows the number of fans owned by each household in a block. Part of the table is covered by an ink blot. There are 58 households who owned at least 2 fans. Each statement below is either true, false or not possible to tell.",
    question_parts: [
      { part: "a", text: "There were 72 households in the block." },
      { part: "b", text: "9 households owned at least 1 fan." },
      { part: "c", text: "The number of households who owned 2 fans was equal to the number of households who owned 3 fans." },
    ],
  },
  // Placeholder text replaced with the paper's question (answers 5:1, 40%, 16 match the graph).
  "2021_REDSWASTIKA_P2_Q10": {
    why: "placeholder text → the paper's question",
    question: "A library had 48 laptops ready for loan at 14 00 at its counter. Laptops were issued out on loan only for the first hour. Then the borrowers could return the laptops from 15 00 to 16 30. The line graph shows the number of laptops at the counter from 14 00 to 16 30.",
    question_parts: [
      { part: "a", text: "What was the ratio of the number of laptops at the counter to the number of laptops loaned out at 16 00? Express your answer in its simplest form." },
      { part: "b", text: "What was the percentage decrease in the number of laptops at the counter from 14 30 to 15 00?" },
      { part: "c", text: "On average, how many laptops were returned to the counter per hour from 15 00 to 16 30?" },
    ],
  },
  // Stored text described a different figure; the paper's Q27 (answer 42 cm²) is this one. Figure added separately.
  "2021_RAFFLES_P1_Q27": {
    why: "text → the paper's Q27",
    question: "PQRS is a rectangle and PUS is a triangle. The area of triangle PTS is 12 cm². Find the area of PQRTUS.",
  },
  // Exact copy of Q11; the paper's real Q14 is an angles question, so this record is taken out of the app.
  "2021_St_Nicholas_P1A_Q14": {
    why: "duplicate of Q11 → excluded",
    excluded: true,
    excluded_reason: "Duplicate of 2021_St_Nicholas_P1A_Q11 (the paper's Q14 is a different, angles question)",
  },
};

const BASE = "https://firestore.googleapis.com/v1/projects/primary-math-sg/databases/default/documents/questions";
const DRY = process.argv.includes("--dry");
const fsParts = (parts: Part[]) => ({ arrayValue: { values: parts.map((p) => ({ mapValue: { fields: { part: { stringValue: p.part }, text: { stringValue: p.text } } } })) } });

(async () => {
  const token = await accessToken(loadCredentials());
  const dispatcher = makeDispatcher();
  const undo: Record<string, unknown> = {};
  for (const [id, fix] of Object.entries(FIXES)) {
    const r = await ufetch(`${BASE}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, dispatcher });
    if (!r.ok) throw new Error(`${id}: ${r.status}`);
    const live = fromFsFields(((await r.json()) as { fields: never }).fields) as Record<string, unknown>;
    const fields: Record<string, unknown> = {};
    if (fix.question !== undefined) fields.question = { stringValue: fix.question };
    if (fix.question_parts) fields.question_parts = fsParts(fix.question_parts);
    if (fix.excluded !== undefined) fields.excluded = { booleanValue: fix.excluded };
    if (fix.excluded_reason !== undefined) fields.excluded_reason = { stringValue: fix.excluded_reason };
    const touched = Object.keys(fields);
    undo[id] = { why: fix.why, old: Object.fromEntries(touched.map((k) => [k, live[k] ?? null])) };
    if (DRY) { console.log("would update", id, "-", fix.why, "| fields:", touched.join(", ")); continue; }
    Object.assign(fields, { last_edited_by: { stringValue: "app-text-fix" }, last_edited_at: { stringValue: new Date().toISOString() } });
    const mask = Object.keys(fields).map((m) => `updateMask.fieldPaths=${m}`).join("&");
    const u = await ufetch(`${BASE}/${encodeURIComponent(id)}?${mask}&currentDocument.exists=true`, { method: "PATCH", dispatcher, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
    if (!u.ok) throw new Error(`${id}: ${u.status} ${(await u.text()).slice(0, 200)}`);
    console.log("updated", id, "-", fix.why);
  }
  if (!DRY) fs.writeFileSync(`reports/text-fix-undo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(undo, null, 1));
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
