// Pure helpers for RichText layout (kept free of react-native so they can be unit-tested).
import type { RichToken } from "@p6/shared";

/** Text split into wrap-friendly chunks: each word keeps its trailing spaces; leading spaces form their own chunk. */
export function chunkText(s: string): string[] {
  return s.match(/[ \t\r\n]+|[^ \t\r\n]+[ \t\r\n]*/g) ?? []; // plain whitespace only: a no-break space stays inside its chunk
}

/** True when the tokens need the flex-row layout (anything stacked or raised); plain text uses a single <Text>. */
export function needsRowLayout(tokens: RichToken[]): boolean {
  return tokens.some((t) => t.t === "frac" || t.t === "sup" || t.t === "sub" || t.t === "sqrt");
}

/** Splits a token list into lines at "br" tokens. */
export function splitLines(tokens: RichToken[]): RichToken[][] {
  const lines: RichToken[][] = [[]];
  for (const t of tokens) {
    if (t.t === "br") lines.push([]);
    else lines[lines.length - 1]!.push(t);
  }
  return lines;
}


const NBSP = "\u00A0";
/** Glues an operator to its neighbours ("2 ÷ 7", "a − b") with no-break spaces so a line never breaks inside it.
 *  Only spaces between two operands change; an operator at the start or end of a run is left alone. */
export function glueOperators(s: string): string {
  return s.replace(/(\S) ([×÷+−=]) (?=\S)/g, `$1${NBSP}$2${NBSP}`);
}
