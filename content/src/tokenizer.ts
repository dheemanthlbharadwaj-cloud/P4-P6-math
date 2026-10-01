// LaTeX-ish source text → RichText tokens. `$...$` is math; everything else (including fullwidth ＄) is plain text.
import type { RichText, RichToken } from "@p6/shared";

export interface TokenizeStats {
  unknownCommands: Map<string, number>;
}
export const newStats = (): TokenizeStats => ({ unknownCommands: new Map() });

const SYMBOLS: Record<string, string> = {
  times: "×", div: "÷", circ: "°", degree: "°", pi: "π", angle: "∠", le: "≤", leq: "≤", ge: "≥", geq: "≥",
  ne: "≠", neq: "≠", cdot: "·", "%": "%", triangle: "△", parallel: "∥", perp: "⊥", therefore: "∴",
  approx: "≈", pm: "±", rightarrow: "→", to: "→", ldots: "…", dots: "…", cdots: "…", quad: " ", qquad: "  ",
  alpha: "α", beta: "β", theta: "θ", mu: "μ", sim: "~", cong: "≅", infty: "∞", prime: "′", "$": "$",
  "{": "{", "}": "}", "#": "#", "&": "&", "_": "_", ",": " ", ";": " ", ":": " ", "!": "", " ": " ", ">": " ",
  neg: "¬", leftarrow: "←", Rightarrow: "⇒", because: "∵", ell: "ℓ", dfrac: "", sqcup: "∪", cup: "∪", cap: "∩",
  minus: "−", plus: "+", textbackslash: "\\", lbrace: "{", rbrace: "}", square: "□",
};
const PASSTHROUGH = new Set(["left", "right", "displaystyle", "textstyle", "big", "Big", "bigg", "limits", "bigl", "bigr"]);
const GROUPING = new Set(["text", "mathrm", "mathbf", "textbf", "textit", "mathit", "mbox", "operatorname", "mathsf", "boldsymbol", "underline", "overline", "emph"]);

function pushText(out: RichToken[], v: string) {
  if (!v) return;
  const last = out[out.length - 1];
  if (last && last.t === "text") last.v += v;
  else out.push({ t: "text", v });
}

class MathParser {
  i = 0;
  constructor(private s: string, private stats: TokenizeStats) {}

  parse(until?: string): RichToken[] {
    const out: RichToken[] = [];
    const s = this.s;
    while (this.i < s.length) {
      const c = s[this.i];
      if (until && c === until) break;
      if (c === "\\") { this.command(out); continue; }
      if (c === "{") { this.i++; for (const t of this.parse("}")) this.add(out, t); this.i++; continue; }
      if (c === "}") { this.i++; continue; } // stray
      if (c === "^" || c === "_") {
        this.i++;
        const arg = this.argument();
        if (c === "^" && arg.length === 1 && arg[0].t === "text" && arg[0].v === "°") pushText(out, "°");
        else if (arg.length) out.push({ t: c === "^" ? "sup" : "sub", v: arg });
        continue;
      }
      if (c === "~") { pushText(out, " "); this.i++; continue; }
      pushText(out, c);
      this.i++;
    }
    return out;
  }

  private add(out: RichToken[], t: RichToken) {
    if (t.t === "text") pushText(out, t.v);
    else out.push(t);
  }

  /** Next braced group or single char/command, as tokens. */
  argument(): RichToken[] {
    const s = this.s;
    while (s[this.i] === " ") this.i++;
    if (this.i >= s.length) return [];
    if (s[this.i] === "{") {
      this.i++;
      const inner = this.parse("}");
      this.i++;
      return inner;
    }
    if (s[this.i] === "\\") {
      const out: RichToken[] = [];
      this.command(out);
      return out;
    }
    const ch = s[this.i++];
    return [{ t: "text", v: ch }];
  }

  command(out: RichToken[]) {
    const s = this.s;
    const start = this.i;
    this.i++; // backslash
    if (this.i >= s.length) return;
    let name = "";
    if (/[a-zA-Z]/.test(s[this.i])) {
      while (this.i < s.length && /[a-zA-Z]/.test(s[this.i])) name += s[this.i++];
    } else {
      name = s[this.i++];
    }
    if (name === "\\") { out.push({ t: "br" }); return; }
    if (name === "frac" || name === "dfrac" || name === "tfrac") {
      const n = this.argument();
      const d = this.argument();
      let w: string | undefined;
      // mixed number: digits immediately before \frac ("2\frac{1}{3}")
      if (start > 0 && /\d/.test(s[start - 1])) {
        const last = out[out.length - 1];
        if (last && last.t === "text") {
          const m = last.v.match(/(?<![\d.])(\d+)$/);
          if (m) {
            w = m[1];
            last.v = last.v.slice(0, last.v.length - w.length);
            if (!last.v) out.pop();
          }
        }
      }
      out.push(w ? { t: "frac", n, d, w } : { t: "frac", n, d });
      return;
    }
    if (name === "sqrt") {
      if (s[this.i] === "[") { const j = s.indexOf("]", this.i); this.i = j < 0 ? this.i + 1 : j + 1; }
      out.push({ t: "sqrt", v: this.argument() });
      return;
    }
    if (GROUPING.has(name)) {
      for (const t of this.argument()) this.add(out, t);
      return;
    }
    if (PASSTHROUGH.has(name)) {
      // \left( … : keep following delimiter ('.' means none)
      if (name === "left" || name === "right" || name.startsWith("big")) {
        if (s[this.i] === ".") this.i++;
        else if (s[this.i] === "\\" && /[{}|]/.test(s[this.i + 1] ?? "")) { pushText(out, s[this.i + 1]); this.i += 2; }
      }
      return;
    }
    if (name in SYMBOLS) { pushText(out, SYMBOLS[name]); return; }
    // unknown command: strip backslash, keep the word, count it
    this.stats.unknownCommands.set(name, (this.stats.unknownCommands.get(name) ?? 0) + 1);
    pushText(out, name);
  }
}

export function tokenizeMath(src: string, stats: TokenizeStats = newStats()): RichText {
  return new MathParser(src, stats).parse();
}

function plainWithBreaks(text: string, out: RichToken[]) {
  const norm = text.replace(/\\n/g, "\n").replace(/\r\n?/g, "\n").replace(/\\\$/g, "$");
  const lines = norm.split("\n");
  lines.forEach((line, idx) => {
    if (idx > 0) out.push({ t: "br" });
    pushText(out, line);
  });
}

/** Tokenize a source string with `$...$` math segments. */
export function tokenize(text: string | null | undefined, stats: TokenizeStats = newStats()): RichText {
  if (text == null) return [];
  const src = String(text).replace(/\$\$/g, "$");
  const out: RichToken[] = [];
  // split on unescaped ASCII $
  const segments: { math: boolean; v: string }[] = [];
  let cur = "";
  let inMath = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\" && src[i + 1] === "$") { cur += inMath ? "\\$" : "$"; i++; continue; }
    if (c === "$") {
      segments.push({ math: inMath, v: cur });
      cur = "";
      inMath = !inMath;
      continue;
    }
    cur += c;
  }
  // unbalanced trailing `$`: treat the dangling math segment as literal text
  if (inMath) segments.push({ math: false, v: "$" + cur });
  else segments.push({ math: false, v: cur });
  for (const seg of segments) {
    if (!seg.v) continue;
    if (!seg.math) { plainWithBreaks(seg.v, out); continue; }
    for (const t of tokenizeMath(seg.v.replace(/\r?\n/g, " "), stats)) {
      if (t.t === "text") pushText(out, t.v);
      else out.push(t);
    }
  }
  return out;
}

/** Plain-text rendering of tokens (for stem length, search, display strings). */
export function richToPlain(tokens: RichText): string {
  return tokens
    .map((t) => {
      switch (t.t) {
        case "text": return t.v;
        case "br": return "\n";
        case "frac": return `${t.w ? t.w + " " : ""}${richToPlain(t.n)}/${richToPlain(t.d)}`;
        case "sup": return "^" + richToPlain(t.v);
        case "sub": return "_" + richToPlain(t.v);
        case "sqrt": return "√(" + richToPlain(t.v) + ")";
      }
    })
    .join("");
}
