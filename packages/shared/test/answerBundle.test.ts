import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkAnswer, normalizeInput } from "../src/answer";
import type { AnswerSpec, Question } from "../src/types";

// Every text answer of the committed question bundles: the forgiving matcher must keep accepting everything the exact one did.
const root = path.join(__dirname, "../../../apps/mobile/assets/content");
const grades = fs.existsSync(root) ? fs.readdirSync(root).filter((g) => fs.existsSync(path.join(root, g, "questions.json"))) : [];
const compact = (s: string) => s.replace(/[\s.]+$/g, "").replace(/\s+/g, "");
/** The text comparison as it was before the forgiving match. */
function exactText(accepted: string[], raw: string): boolean {
  const cands = new Set([compact(normalizeInput(raw)), compact(raw.normalize("NFKC").toLowerCase())]);
  return accepted.some((a) => {
    const ca = new Set([compact(normalizeInput(a)), compact(a.normalize("NFKC").toLowerCase())]);
    for (const c of cands) if (ca.has(c)) return true;
    return false;
  });
}

describe.skipIf(!grades.length)("bundle text answers (old vs new checker)", () => {
  const specs: { id: string; accepted: string[]; display: string }[] = [];
  for (const g of grades) {
    const qs = JSON.parse(fs.readFileSync(path.join(root, g, "questions.json"), "utf8")).questions as Record<string, Question>;
    for (const q of Object.values(qs)) for (const p of q.parts ?? []) if (p.answer.kind === "text" && p.answer.accepted.length) specs.push({ id: q.id, accepted: p.answer.accepted, display: p.display });
  }
  const variants = (a: string) => [a, a.toUpperCase(), a.toLowerCase(), `  ${a}  `, a.replace(/\s+/g, "  "), a + ".", a.replace(/ /g, "")];

  it("has text answers to test", () => expect(specs.length).toBeGreaterThan(100));
  it("everything the old checker accepted is still accepted", () => {
    let oldYes = 0;
    for (const s of specs) {
      const spec: AnswerSpec = { kind: "text", accepted: s.accepted };
      for (const a of [...s.accepted, s.display]) for (const v of variants(a)) {
        if (exactText(s.accepted, v)) { oldYes++; expect(checkAnswer(spec, v), `${s.id}: ${JSON.stringify(v)}`).toBe(true); }
      }
    }
    expect(oldYes).toBeGreaterThan(500);
  });
  it("every accepted answer accepts itself, in forgiving spellings too", () => {
    for (const s of specs) {
      const spec: AnswerSpec = { kind: "text", accepted: s.accepted };
      for (const a of s.accepted) {
        expect(checkAnswer(spec, a), `${s.id}: ${a}`).toBe(true);
        expect(checkAnswer(spec, a.toUpperCase().replace(/[,;]/g, " ")), `${s.id}: ${a} (upper, no , ;)`).toBe(true);
      }
    }
  });
  it("a wrong number or a missing number/letter is never accepted", () => {
    let checked = 0;
    for (const s of specs) {
      const spec: AnswerSpec = { kind: "text", accepted: s.accepted };
      const a = s.accepted[0];
      const nums = [...a.matchAll(/\d+/g)];
      if (!nums.length) continue;
      const last = nums[nums.length - 1];
      const wrong = a.slice(0, last.index) + String(Number(last[0]) + 1) + a.slice((last.index ?? 0) + last[0].length);
      if (!s.accepted.some((x) => exactText([x], wrong) || exactText([wrong], x))) { checked++; expect(checkAnswer(spec, wrong), `${s.id}: ${wrong} vs ${a}`).toBe(s.accepted.some((x) => x === wrong)); }
      const first = nums[0];
      const dropped = (a.slice(0, first.index) + a.slice((first.index ?? 0) + first[0].length)).trim();
      if (dropped && nums.length >= 1 && !s.accepted.includes(dropped)) { checked++; expect(checkAnswer(spec, dropped), `${s.id}: ${dropped} vs ${a}`).toBe(false); }
    }
    expect(checked).toBeGreaterThan(100);
  });
});
