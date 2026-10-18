// Apply a JSON list of editor-bank edits: [{ id, field, old, new, reason }].
//   npx tsx scripts/apply-edits.ts [file.json] --dry   -> shows what would change (reads only)
//   npx tsx scripts/apply-edits.ts [file.json]         -> writes; undo manifest in content/reports/edits-undo-<stamp>.json
// Default file: reports/tester-fixes-2026-10-18.json. `field` is an editor field or a dotted path into a map
// (e.g. "answer_key", "question", "options.2"). For every edit the live value is re-read first and the edit is
// REFUSED when live != old (an edit whose live value already equals `new` is reported as already applied).
// Any refusal aborts before anything is written. Stamps last_edited_by "app-tester-fix" and last_edited_at (ISO).
// Add --notes to also append each reason to verification_notes. Needs the service account (see skill §3).
import fs from "node:fs";
import { fetch as ufetch } from "undici";
import { accessToken, loadCredentials, makeDispatcher, fromFsFields } from "../src/sync";

interface Edit { id: string; field: string; old: unknown; new: unknown; reason?: string }
const BASE = "https://firestore.googleapis.com/v1/projects/primary-math-sg/databases/default/documents/questions";
const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const NOTES = args.includes("--notes");
const file = args.find((a) => !a.startsWith("--")) ?? "reports/tester-fixes-2026-10-18.json";
const edits: Edit[] = JSON.parse(fs.readFileSync(file, "utf8"));

// A missing field counts as null (the snapshot records absent fields as null).
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const getPath = (o: unknown, path: string[]): unknown => path.reduce<unknown>((c, k) => (c && typeof c === "object" ? (c as Record<string, unknown>)[k] : undefined), o);
const q = (seg: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(seg) ? seg : `\`${seg}\``);
function toFs(v: unknown): unknown {
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v === null) return { nullValue: null };
  throw new Error(`unsupported value type for ${JSON.stringify(v)}`);
}
/** Nest a leaf value under its dotted path as mapValue wrappers; merge siblings sharing a prefix. */
function putNested(fields: Record<string, any>, path: string[], leaf: unknown) {
  const [head, ...rest] = path;
  if (!rest.length) { fields[head] = leaf; return; }
  fields[head] ??= { mapValue: { fields: {} } };
  putNested(fields[head].mapValue.fields, rest, leaf);
}

(async () => {
  const byId = new Map<string, Edit[]>();
  for (const e of edits) byId.set(e.id, [...(byId.get(e.id) ?? []), e]);
  const token = await accessToken(loadCredentials());
  const dispatcher = makeDispatcher();
  const plan: { id: string; updateTime: string; todo: Edit[]; liveNotes: unknown }[] = [];
  const refused: string[] = [];
  const undo: { id: string; field: string; old: unknown; new: unknown }[] = [];

  for (const [id, list] of byId) {
    const r = await ufetch(`${BASE}/${id}`, { headers: { Authorization: `Bearer ${token}` }, dispatcher });
    if (!r.ok) { refused.push(`${id}: read failed ${r.status}`); continue; }
    const doc = (await r.json()) as { fields: never; updateTime: string };
    const live = fromFsFields(doc.fields);
    const todo: Edit[] = [];
    for (const e of list) {
      const cur = getPath(live, e.field.split("."));
      if (same(cur, e.new)) console.log(`already applied ${id} ${e.field}`);
      else if (!same(cur, e.old)) refused.push(`${id} ${e.field}: live ${JSON.stringify(cur)} != expected old ${JSON.stringify(e.old)}`);
      else { todo.push(e); console.log(`${DRY ? "would set" : "set"} ${id} ${e.field}:\n  ${JSON.stringify(cur)}\n  -> ${JSON.stringify(e.new)}`); }
    }
    if (todo.length) plan.push({ id, updateTime: doc.updateTime, todo, liveNotes: (live as { verification_notes?: unknown }).verification_notes });
  }
  if (refused.length) { console.error("REFUSED, nothing written:\n  " + refused.join("\n  ")); process.exit(2); }
  if (DRY) { console.log(`dry run: ${plan.reduce((n, p) => n + p.todo.length, 0)} edit(s) on ${plan.length} doc(s) would be written`); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const undoFile = `reports/edits-undo-${stamp}.json`;
  for (const p of plan) {
    const fields: Record<string, any> = {};
    const masks: string[] = [];
    for (const e of p.todo) {
      const path = e.field.split(".");
      putNested(fields, path, toFs(e.new));
      masks.push(path.map(q).join("."));
      undo.push({ id: p.id, field: e.field, old: e.old, new: e.new });
    }
    if (NOTES) {
      const add = p.todo.map((e) => `FIXED 2026-10-18 (app tester) ${e.field}: ${e.reason ?? ""}`).join("\n");
      fields.verification_notes = toFs([p.liveNotes, add].filter(Boolean).join("\n"));
      masks.push("verification_notes");
    }
    fields.last_edited_by = toFs("app-tester-fix"); masks.push("last_edited_by");
    fields.last_edited_at = toFs(new Date().toISOString()); masks.push("last_edited_at");
    const qs = [...masks.map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`), `currentDocument.updateTime=${encodeURIComponent(p.updateTime)}`].join("&");
    const u = await ufetch(`${BASE}/${p.id}?${qs}`, { method: "PATCH", dispatcher, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
    if (!u.ok) { fs.writeFileSync(undoFile, JSON.stringify(undo, null, 1)); throw new Error(`${p.id}: ${u.status} ${(await u.text()).slice(0, 200)} (undo so far in ${undoFile})`); }
    console.log("updated", p.id);
    fs.writeFileSync(undoFile, JSON.stringify(undo, null, 1)); // after every doc, so a crash still leaves an undo
  }
  console.log(`undo manifest: content/${undoFile} (to undo: swap old/new in a copy and run this script on it)`);
})().catch((e) => { console.error(e.message ?? e); process.exit(1); });
