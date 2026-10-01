import fs from "node:fs";
import path from "node:path";
import type { Grade } from "@p6/shared";
import { prepare, wantsFigure } from "./build";
import { reportPath } from "./paths";
import { CANONICAL_TOPICS, detectSubtopicField, loadMapping, loadSnapshot, type RawDoc } from "./source";

export const EXPECTED_SUBTOPICS: Partial<Record<Grade, number>> = { P6: 62 };

export interface AuditResult { markdown: string; subtopicCount: number; ok: boolean }

export function runAuditOn(docs: RawDoc[], grade: Grade, o: { subtopicField?: string; mapping?: ReturnType<typeof loadMapping>; figDir?: string; source?: string } = {}): AuditResult {
  const det = detectSubtopicField(docs, o.subtopicField);
  const prep = prepare(docs, grade, o);
  const L: string[] = [];
  const expected = EXPECTED_SUBTOPICS[grade];
  const count = prep.defs.length;
  const nonCanon = new Map<string, number>();
  for (const n of prep.norm) if (!CANONICAL_TOPICS.includes(n.topic)) nonCanon.set(n.topic || "(empty)", (nonCanon.get(n.topic || "(empty)") ?? 0) + 1);

  L.push(`# ${grade} content audit`, "");
  L.push(`- Source: ${o.source ?? "snapshot"} (${docs.length} docs)`, `- Mapping override: ${o.mapping ? `yes (${o.mapping.size} rows)` : "no"}`, "");
  const countOk = expected === undefined || count === expected;
  if (!countOk) {
    L.push(`> **WARNING: expected ${expected} subtopics but found ${count}.**`, "");
  }
  L.push("## Subtopic field", "");
  L.push(`Detected field: **${det.field ?? "NONE FOUND"}**`, "");
  if (!det.field) L.push("> **WARNING: no subtopic field found in the data. Provide content/mapping/" + grade + "-subtopics.csv or --subtopic-field.**", "");
  L.push("| field | docs with value | distinct values |", "|---|---|---|");
  for (const c of det.candidates) L.push(`| ${c.field} | ${c.coverage} | ${c.distinct} |`);
  L.push("", `Subtopics (topic+subtopic pairs): **${count}**${expected ? ` (expected ${expected}) ${countOk ? "OK" : "MISMATCH"}` : ""}`, "");

  // counts
  type Cnt = { LV1: number; LV2: number; LV3: number; ok: { LV1: number; LV2: number; LV3: number } };
  const cnt = new Map<string, Cnt>();
  const nd = new Map(prep.norm.map((n) => [n.id, n]));
  for (const c of prep.candidates) {
    const n = nd.get(c.q.id)!;
    const key = n.topic + "\0" + n.subtopic;
    const e = cnt.get(key) ?? { LV1: 0, LV2: 0, LV3: 0, ok: { LV1: 0, LV2: 0, LV3: 0 } };
    e[c.q.difficulty]++;
    if (!c.hasError && c.q.autoMarkable) e.ok[c.q.difficulty]++;
    cnt.set(key, e);
  }
  L.push("## Questions per topic / subtopic", "", "Cells are `usable (total)`; usable = no has_error and auto-markable.", "");
  const short: string[] = [];
  for (const topic of CANONICAL_TOPICS) {
    const defs = prep.defs.filter((d) => d.topic === topic);
    if (!defs.length) { L.push(`### ${topic}`, "", "_no subtopics_", ""); continue; }
    const tot = prep.candidates.filter((c) => c.q.topic === topic).length;
    L.push(`### ${topic} (${tot} questions, ${defs.length} subtopics)`, "", "| subtopic | LV1 | LV2 | LV3 |", "|---|---|---|---|");
    for (const d of defs) {
      const e = cnt.get(topic + "\0" + d.name)!;
      const cell = (k: "LV1" | "LV2" | "LV3") => `${e.ok[k]} (${e[k]})${e.ok[k] < 5 ? " ⚠" : ""}`;
      L.push(`| ${d.name} | ${cell("LV1")} | ${cell("LV2")} | ${cell("LV3")} |`);
      for (const k of ["LV1", "LV2", "LV3"] as const) if (e.ok[k] < 5) short.push(`${topic} / ${d.name} / ${k}: ${e.ok[k]} usable`);
    }
    L.push("");
  }
  L.push(`## Shortfalls (< 5 usable at a level): ${short.length}`, "", ...(short.length ? short.map((s) => `- ${s}`) : ["none"]), "");

  const hasErr = prep.norm.filter((n) => n.hasError).length;
  const nonAuto = [...prep.nonAutoReasons.entries()];
  const reasonCount = new Map<string, number>();
  for (const [, rs] of nonAuto) for (const r of rs) { const k = r.replace(/part \S+:/, "part:"); reasonCount.set(k, (reasonCount.get(k) ?? 0) + 1); }
  L.push("## Data quality", "");
  L.push(`- has_error: **${hasErr}**`, `- verified: ${prep.norm.filter((n) => n.verified).length}`, `- not auto-markable: **${nonAuto.length}**`);
  for (const [r, n] of [...reasonCount.entries()].sort((a, b) => b[1] - a[1])) L.push(`  - ${r}: ${n}`);
  const needFig = prep.norm.filter((n) => wantsFigure(n.raw)).length;
  L.push(`- questions with a figure: ${needFig}; missing downloaded figure file: **${prep.missingFigures.length}**`);
  if (prep.missingFigures.length) L.push(`  - e.g. ${prep.missingFigures.slice(0, 10).join(", ")}${prep.missingFigures.length > 10 ? " …" : ""}`);
  L.push(`- non-canonical topics: **${[...nonCanon.values()].reduce((a, b) => a + b, 0)}** docs`);
  for (const [t, n] of nonCanon) L.push(`  - "${t}": ${n}`);
  L.push(`- skipped from build (non-canonical topic / no subtopic / bad difficulty): ${prep.skipped.length}`);
  const rs = new Map<string, number>();
  for (const s of prep.skipped) rs.set(s.reason, (rs.get(s.reason) ?? 0) + 1);
  for (const [r, n] of [...rs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) L.push(`  - ${r}: ${n}`);
  const unk = [...prep.stats.unknownCommands.entries()].sort((a, b) => b[1] - a[1]);
  L.push(`- unknown LaTeX commands (backslash stripped): ${unk.reduce((a, [, n]) => a + n, 0)} occurrences`);
  for (const [c, n] of unk.slice(0, 30)) L.push(`  - \\${c}: ${n}`);
  L.push("");
  return { markdown: L.join("\n"), subtopicCount: count, ok: countOk && !!det.field };
}

export function runAudit(grade: Grade, o: { subtopicField?: string; snapshot?: string } = {}): AuditResult {
  const snap = loadSnapshot(grade, o.snapshot);
  const res = runAuditOn(snap.questions, grade, { subtopicField: o.subtopicField, mapping: loadMapping(grade), source: snap.project ? `${snap.project} @ ${snap.fetchedAt ?? "?"}` : "snapshot" });
  const file = reportPath(grade);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, res.markdown);
  return res;
}
