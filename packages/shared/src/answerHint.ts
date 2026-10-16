// Format hints for answer boxes: they show the SHAPE of the expected answer, never the answer itself. Pure; used by the UI.
import type { AnswerPart } from "./types";

const MONEY_UNIT = /[$＄]|dollar/i;
const ALGEBRA = /^[\s\d.a-zπ+\-−×÷*/()^=]*$/i;

/** The unit as a kid should read it: editor "#error-…" markers removed, cm^2 → cm², nothing odd (digits, ";") left. */
function cleanUnit(unit: string | undefined): string {
  const u = (unit ?? "").replace(/\s*#\S+/g, "").replace(/\^2/g, "²").replace(/\^3/g, "³").replace(/([a-z])([23])$/i, (_, l, n) => l + (n === "2" ? "²" : "³")).trim();
  return /[;:\d]/.test(u.replace(/[²³]/g, "")) ? "" : u;
}

function unitSuffix(unit: string | undefined, display: string): string {
  const u = cleanUnit(unit);
  if (u) return ` (${u})`;
  return /%\s*$/.test(display) ? " (%)" : "";
}

/** "Row 96, Column C" → "Type like: Row __, Column _". Numbers become "__", standalone letters "_" (units like the h in "10 h" stay). */
function textTemplate(accepted: string): string | null {
  const s = accepted.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!s) return null;
  // an algebra expression ("5y - 10", "3a/5", "4w"): single-letter variables glued to digits or operators, no label words
  const bare = s.replace(/\b[ap]\.\s?m\./gi, "");
  if (ALGEBRA.test(bare) && !/[a-z]{2,}/i.test(bare) && /\d\s*[a-z]|[a-z]\s*\d|[a-z]\s*[+\-−×÷*/=^()]|[+\-−×÷*/=^()]\s*[a-z]/i.test(bare)) return "Type an expression, like 3y + 2";
  const AM = "\u0001", PM = "\u0002";
  const out = s
    .replace(/\ba\.\s?m\./gi, AM).replace(/\bp\.\s?m\./gi, PM) // a.m. / p.m. stay as they are
    .replace(/\d+/g, "__")
    .replace(/(?<![A-Za-z])([A-Za-z])(?![A-Za-z])/g, (m, ch: string, off: number, whole: string) => {
      if (ch === "a" && /^ [A-Za-z]{2,}/.test(whole.slice(off + 1))) return m; // the article
      if (/[hmslg]/i.test(ch) && /__ ?$/.test(whole.slice(0, off))) return m; // a unit letter after a number: "10 h 45 min"
      return "_";
    })
    .replace(new RegExp(AM, "g"), "a.m.").replace(new RegExp(PM, "g"), "p.m.");
  return /_/.test(out) ? `Type like: ${out}` : "Type your answer in words";
}

/** A short kid-friendly hint for an answer box, or null when there is nothing useful to say. */
export function answerFormatHint(part: Pick<AnswerPart, "answer" | "display">): string | null {
  const a = part.answer;
  switch (a.kind) {
    case "number":
      if (a.unit && MONEY_UNIT.test(a.unit)) return "Type an amount in $, like 12.50";
      return "Type a number" + unitSuffix(a.unit, part.display);
    case "fraction":
      return "Type a fraction, like 3/4 or 1 1/2" + (a.unit && !MONEY_UNIT.test(a.unit) && cleanUnit(a.unit) ? ` (${cleanUnit(a.unit)})` : "");
    case "ratio":
      return a.terms.length >= 3 ? "Type a ratio, like 2 : 3 : 4" : "Type a ratio, like 2 : 3";
    case "text":
      return a.accepted.length ? textTemplate(a.accepted[0]) : null;
  }
}
