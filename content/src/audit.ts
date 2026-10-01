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
  L.push("", `Subtopics (map nodes): **${count}**${expected ? ` (expected ${expected}) ${countOk ? "OK" : "MISMATCH"}` : ""}`, "");

  // counts, keyed by map node (chapter or topic + subtopic)
  type Cnt = { LV1: number; LV2: number; LV3: number; ok: { LV1: number; LV2: number; LV3: number }; sel: { LV1: number; LV2: number; LV3: number } };
  const cnt = new Map<string, Cnt>();
  const badPicks: string[] = [];
  for (const c of prep.candidates) {
    const e = cnt.get(c.q.subtopicId) ?? { LV1: 0, LV2: 0, LV3: 0, ok: { LV1: 0, LV2: 0, LV3: 0 }, sel: { LV1: 0, LV2: 0, LV3: 0 } };
    e[c.q.difficulty]++;
    const usable = !c.hasError && c.q.autoMarkable;
    if (usable) e.ok[c.q.difficulty]++;
    if (c.selectedRank) {
      if (usable) e.sel[c.q.difficulty]++;
      else badPicks.push(`${c.q.id} (${c.q.difficulty}, rank ${c.selectedRank}): ${c.hasError ? "has_error" : (prep.nonAutoReasons.get(c.q.id) ?? ["not auto-markable"]).join("; ")}`);
    }
    cnt.set(c.q.subtopicId, e);
  }
  const anySelection = prep.candidates.some((c) => c.selectedRank);
  L.push("## Questions per map / subtopic", "", `Cells are \`usable (total)\`; usable = no has_error and auto-markable.${anySelection ? " `★n` = usable editor picks (selected) at that level." : ""}`, "");
  const short: string[] = [];
  const maps = [...new Set(prep.defs.map((d) => d.topic))];
  for (const topic of maps) {
    const defs = prep.defs.filter((d) => d.topic === topic);
    const ids = new Set(defs.map((d) => d.id));
    const tot = prep.candidates.filter((c) => ids.has(c.q.subtopicId)).length;
    L.push(`### ${topic} (${tot} questions, ${defs.length} subtopics)`, "", "| subtopic | LV1 | LV2 | LV3 |", "|---|---|---|---|");
    for (const d of defs) {
      const e = cnt.get(d.id)!;
      const cell = (k: "LV1" | "LV2" | "LV3") => `${e.ok[k]} (${e[k]})${anySelection ? ` ★${e.sel[k]}` : ""}${e.ok[k] < 5 ? " ⚠" : ""}`;
      L.push(`| ${d.name} | ${cell("LV1")} | ${cell("LV2")} | ${cell("LV3")} |`);
      for (const k of ["LV1", "LV2", "LV3"] as const) if (e.ok[k] < 5) short.push(`${topic} / ${d.name} / ${k}: ${e.ok[k]} usable`);
    }
    L.push("");
  }
  if (anySelection) {
    L.push(`## Editor picks that can't be used in the main path: ${badPicks.length}`, "", "These are replaced by the next best question at the same level (see build).", "", ...(badPicks.length ? badPicks.map((b) => `- ${b}`) : ["none"]), "");
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
