// 计算题填空判分：把 LaTeX 答案转成表达式，数值/代数等价比较。纯函数，前后端通用。

function matchBrace(s: string, open: number): number {
  const o = s[open];
  const c = o === "{" ? "}" : o === "[" ? "]" : ")";
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === o) depth++;
    else if (s[i] === c) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// 读取一个参数：{...} 或单个字符
function readArg(s: string, i: number): [string, number] {
  while (s[i] === " ") i++;
  if (s[i] === "{") {
    const e = matchBrace(s, i);
    if (e < 0) throw new Error("brace");
    return [s.slice(i + 1, e), e + 1];
  }
  return [s[i] ?? "", i + 1];
}

export function latexToExpr(input: string): string {
  let s = (input ?? "")
    .replace(/\$/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\[,;!:]|\\ |~/g, "")
    .replace(/\\(d|t)frac/g, "\\frac")
    .replace(/\\text\{[^}]*\}/g, "")
    .replace(/\\mathrm\{([^}]*)\}/g, "$1")
    .replace(/\\times|\\cdot|×|·/g, "*")
    .replace(/\\div|÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/\\pi|π/g, "p")
    .replace(/_\{[^}]*\}|_\w/g, "")
    .replace(/\s+/g, "");
  // 带分数：2\frac{1}{3} -> 2 M \frac...
  s = s.replace(/(\d)\\frac/g, "$1M\\frac");
  const conv = (str: string): string => {
    let out = "";
    let i = 0;
    while (i < str.length) {
      if (str.startsWith("\\frac", i)) {
        const [a, j] = readArg(str, i + 5);
        const [b, k] = readArg(str, j);
        out += `((${conv(a)})/(${conv(b)}))`;
        i = k;
      } else if (str.startsWith("\\sqrt", i)) {
        let j = i + 5;
        let n = "2";
        if (str[j] === "[") {
          const e = matchBrace(str, j);
          n = str.slice(j + 1, e);
          j = e + 1;
        }
        const [a, k] = readArg(str, j);
        out += `((${conv(a)})^(1/(${conv(n)})))`;
        i = k;
      } else if (str[i] === "^") {
        const [a, k] = readArg(str, i + 1);
        out += `^(${conv(a)})`;
        i = k;
      } else if (str[i] === "{") {
        const e = matchBrace(str, i);
        out += `(${conv(str.slice(i + 1, e))})`;
        i = e + 1;
      } else if (str[i] === "\\") {
        // 未知命令，跳过
        const m = /^\\[a-zA-Z]+/.exec(str.slice(i));
        i += m ? m[0].length : 1;
      } else {
        out += str[i];
        i++;
      }
    }
    return out;
  };
  let e = conv(s);
  // 处理带分数 M：N M (group) -> (N+group)
  let idx: number;
  while ((idx = e.indexOf("M")) >= 0) {
    let st = idx - 1;
    while (st >= 0 && /[\d.]/.test(e[st])) st--;
    const num = e.slice(st + 1, idx);
    const gEnd = matchBrace(e, idx + 1);
    const g = e.slice(idx + 1, gEnd + 1);
    e = e.slice(0, st + 1) + `(${num}+${g})` + e.slice(gEnd + 1);
  }
  return e;
}

// ---- 表达式求值（支持隐式乘法、单字母变量、p=π）----
type Env = Record<string, number>;

export function evalExpr(expr: string, env: Env): number {
  let i = 0;
  const peek = () => expr[i];
  const parseExpr = (): number => {
    let v = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = expr[i++];
      const r = parseTerm();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const startsFactor = (c: string | undefined) => !!c && (/[\d.a-zA-Z(]/.test(c));
  const parseTerm = (): number => {
    let v = parseUnary();
    for (;;) {
      const c = peek();
      if (c === "*" || c === "/") {
        i++;
        const r = parseUnary();
        v = c === "*" ? v * r : v / r;
      } else if (startsFactor(c)) {
        v = v * parsePow();
      } else break;
    }
    return v;
  };
  const parseUnary = (): number => {
    if (peek() === "-") { i++; return -parseUnary(); }
    if (peek() === "+") { i++; return parseUnary(); }
    return parsePow();
  };
  const parsePow = (): number => {
    const base = parseAtom();
    if (peek() === "^") {
      i++;
      const ex = parseUnary();
      return Math.pow(base, ex);
    }
    return base;
  };
  const parseAtom = (): number => {
    const c = peek();
    if (c === "(") {
      i++;
      const v = parseExpr();
      if (peek() !== ")") throw new Error("paren");
      i++;
      return v;
    }
    if (c && /[\d.]/.test(c)) {
      const m = /^\d*\.?\d+|^\d+\.?/.exec(expr.slice(i));
      if (!m) throw new Error("num");
      i += m[0].length;
      return parseFloat(m[0]);
    }
    if (c && /[a-zA-Z]/.test(c)) {
      i++;
      if (c === "p") return Math.PI;
      if (!(c in env)) throw new Error("var");
      return env[c];
    }
    throw new Error("atom");
  };
  const v = parseExpr();
  if (i !== expr.length) throw new Error("trailing");
  return v;
}

function varsOf(expr: string): string[] {
  return Array.from(new Set((expr.match(/[a-oq-zA-Z]/g) ?? []).filter((c) => c !== "M")));
}

const ENVS: Env[] = [0, 1, 2].map((k) => {
  const e: Env = {};
  "abcdefghijklmnoqrstuvwxyzABCDEFGHIJKLMNOQRSTUVWXYZ".split("").forEach((ch, n) => {
    e[ch] = 1.17 + ((n * 7 + k * 13) % 17) * 0.137 + k * 0.31;
  });
  return e;
});

function close(a: number, b: number) {
  if (!isFinite(a) || !isFinite(b)) return false;
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function exprEquivalent(a: string, b: string): boolean {
  try {
    const ea = latexToExpr(a);
    const eb = latexToExpr(b);
    if (!ea || !eb) return false;
    return ENVS.every((env) => close(evalExpr(ea, env), evalExpr(eb, env)));
  } catch {
    return norm(a) === norm(b);
  }
}

function norm(s: string) {
  return (s ?? "").replace(/\$|\s|\\[,;!: ]/g, "").replace(/\\(d|t)frac/g, "\\frac").toLowerCase();
}

type Item = { v: string | null; val: string };

function splitItems(latex: string): Item[] {
  const s = (latex ?? "")
    .replace(/\$/g, "")
    .replace(/\\text\{\s*(或|或者|and|or|且)\s*\}/g, ",")
    .replace(/或|，|；|;|\\quad|\\qquad/g, ",");
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    if (ch === "}" || ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  const items: Item[] = [];
  let lastVar: string | null = null;
  for (const p of parts.map((x) => x.trim()).filter(Boolean)) {
    const eq = p.split("=");
    if (eq.length === 2) {
      const lhs = latexToExpr(eq[0]);
      if (/^[a-zA-Z]$/.test(lhs)) {
        lastVar = lhs;
        items.push({ v: lhs, val: eq[1] });
        continue;
      }
    }
    items.push({ v: lastVar, val: p });
  }
  return items;
}

/** 判断学生答案是否正确 */
export function gradeCalcAnswer(given: string | null | undefined, expected: string | null | undefined): boolean {
  const g = (given ?? "").trim();
  const e = (expected ?? "").trim();
  if (!g || !e) return false;
  if (norm(g) === norm(e)) return true;
  const E = splitItems(e);
  const G = splitItems(g);
  if (E.length !== G.length || E.length === 0) return false;
  const useVars = G.every((x) => x.v !== null) && E.every((x) => x.v !== null);
  const used = new Set<number>();
  for (const ei of E) {
    const k = G.findIndex(
      (gi, idx) => !used.has(idx) && (!useVars || gi.v === ei.v) && exprEquivalent(gi.val, ei.val),
    );
    if (k < 0) return false;
    used.add(k);
  }
  return true;
}

export { varsOf };
