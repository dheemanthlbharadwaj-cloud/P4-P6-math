import type { Grade } from "@p6/shared";
import { runAudit } from "./audit";
import { buildSourceInfo, runBuild, writeSourceInfo } from "./build";
import fs from "node:fs";
import path from "node:path";
import { outDirFor } from "./paths";
import { loadSnapshot } from "./source";
import { runMock } from "./mock";
import { CredentialsError, runSync } from "./sync";

function parseArgs(argv: string[]) {
  const cmd = argv[0];
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) flags[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
    else flags[k] = true;
  }
  return { cmd, flags };
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  const grade = String(flags.grade ?? "P6") as Grade;
  if (!["P4", "P5", "P6"].includes(grade)) throw new Error(`Unknown grade ${grade}`);
  const sf = typeof flags["subtopic-field"] === "string" ? (flags["subtopic-field"] as string) : undefined;
  switch (cmd) {
    case "sync":
      await runSync(grade, { mode: (flags.mode as "auto" | "rest" | "admin") ?? "auto", skipFigures: !!flags["skip-figures"], fromFile: flags["from-file"] as string | undefined });
      break;
    case "audit": {
      const r = runAudit(grade, { subtopicField: sf });
      console.log(r.markdown);
      if (!r.ok) console.error(`\n!!! AUDIT PROBLEM: ${r.subtopicCount} subtopics found (see report).`);
      break;
    }
    case "build": {
      const r = await runBuild(grade, { subtopicField: sf });
      console.log(`Built ${grade}: ${r.questions} questions (${r.excludedHasError} has_error excluded, ${r.skipped} skipped), ${r.subtopics} subtopics, ${r.figureCount} figures, ${r.shortfallSubtopics} subtopics with shortfall, version ${r.version}\n→ ${r.dir}`);
      for (const n of r.selectionNotes) console.log(`Level ${n.level} of ${n.subtopicId} filled with ${n.id} (${n.fromDifficulty}): too few allowed questions of its own difficulty`);
      if (r.unknownLatex.length) console.log("Unknown LaTeX commands:", r.unknownLatex.map(([c, n]) => `\\${c}×${n}`).join(" "));
      break;
    }
    case "source-info": {
      // Regenerates source-info.json (see build.ts) for the bundle already in apps/mobile/assets/content, without a rebuild.
      const dir = outDirFor(grade);
      const ids = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, "questions.json"), "utf8")).questions);
      const info = buildSourceInfo(grade, loadSnapshot(grade), ids);
      writeSourceInfo(dir, info);
      console.log(`source-info ${grade}: snapshotAt ${info.snapshotAt}, ${Object.keys(info.figureSources).length} figure sources, ${info.selected.length} picked → ${dir}`);
      break;
    }
    case "mock": {
      const r = await runMock(grade);
      console.log(`Mock ${grade}: ${r.questions} questions, ${r.subtopics} subtopics, ${r.figureCount} figures, version ${r.version}\n→ ${r.dir}`);
      break;
    }
    default:
      console.error("Usage: cli <sync|audit|build|source-info|mock> --grade P6 [--subtopic-field name] [--mode auto|rest|admin] [--skip-figures] [--from-file export.json]");
      process.exit(2);
  }
}

main().catch((e) => {
  if (e instanceof CredentialsError) console.error(`\nERROR: ${e.message}`);
  else console.error(e);
  process.exit(1);
});
