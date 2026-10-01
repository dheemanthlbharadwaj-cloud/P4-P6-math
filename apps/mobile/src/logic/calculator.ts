// Safe arithmetic evaluator for the built-in calculator: + − × ÷ ( ) decimals, unary minus, %. No eval().
type Tok = { k: "num"; v: number } | { k: "op"; v: "+" | "-" | "*" | "/" } | { k: "(" } | { k: ")" } | { k: "%" };

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " ") { i++; continue; }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      let dots = 0;
      while (j < src.length && ((src[j] >= "0" && src[j] <= "9") || src[j] === ".")) {
        if (src[j] === ".") dots++;
        j++;
      }
      if (dots > 1) return null;
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) return null;
      out.push({ k: "num", v });
      i = j;
      continue;
    }
    if (c === "+") out.push({ k: "op", v: "+" });
    else if (c === "-" || c === "−" || c === "–") out.push({ k: "op", v: "-" });
    else if (c === "*" || c === "×" || c === "x") out.push({ k: "op", v: "*" });
    else if (c === "/" || c === "÷") out.push({ k: "op", v: "/" });
    else if (c === "(") out.push({ k: "(" });
    else if (c === ")") out.push({ k: ")" });
    else if (c === "%") out.push({ k: "%" });
    else return null;
    i++;
  }
  return out;
}

/** Returns null for malformed input, division by zero or non-finite results. */
export function evaluate(src: string): number | null {
  const toks = tokenize(src);
  if (!toks || toks.length === 0) return null;
  let pos = 0;
  let bad = false;

  const expr = (): number => {
    let v = term();
    while (pos < toks.length) {
      const t = toks[pos];
      if (t.k === "op" && (t.v === "+" || t.v === "-")) {
        pos++;
        const r = term();
        v = t.v === "+" ? v + r : v - r;
      } else break;
    }
    return v;
  };
  const term = (): number => {
    let v = unary();
    while (pos < toks.length) {
      const t = toks[pos];
      if (t.k === "op" && (t.v === "*" || t.v === "/")) {
        pos++;
        const r = unary();
        if (t.v === "/" && r === 0) bad = true;
        v = t.v === "*" ? v * r : v / r;
      } else if (t.k === "(") {
        v = v * unary(); // implicit multiplication: 2(3+4)
      } else break;
    }
    return v;
  };
  const unary = (): number => {
    const t = toks[pos];
    if (t?.k === "op" && (t.v === "-" || t.v === "+")) {
      pos++;
      const v = unary();
      return t.v === "-" ? -v : v;
    }
    return postfix();
  };
  const postfix = (): number => {
    let v = primary();
    while (toks[pos]?.k === "%") {
      pos++;
      v = v / 100;
    }
    return v;
  };
  const primary = (): number => {
    const t = toks[pos];
    if (!t) { bad = true; return 0; }
    if (t.k === "num") { pos++; return t.v; }
    if (t.k === "(") {
      pos++;
      const v = expr();
      if (toks[pos]?.k === ")") pos++;
      else bad = true;
      return v;
    }
    bad = true;
    return 0;
  };

  const result = expr();
  if (bad || pos !== toks.length || !Number.isFinite(result)) return null;
  return result;
}

export function formatResult(v: number): string {
  const r = Math.round(v * 1e10) / 1e10;
  const s = String(r);
  return s.includes("e") ? r.toPrecision(10) : s;
}
