export type ChallengeModule =
  | "negative"
  | "decimal"
  | "fraction"
  | "exponent"
  | "root";

export const CHALLENGE_MODULES: { key: ChallengeModule; name: string }[] = [
  { key: "negative", name: "正负数" },
  { key: "decimal", name: "小数" },
  { key: "fraction", name: "分数" },
  { key: "exponent", name: "指数" },
  { key: "root", name: "根号" },
];

export type AnswerKind = "number" | "fraction";

export interface Question {
  prompt: string;
  kind: AnswerKind;
  answer: number;       // 数值（用于校验）
  tolerance: number;
  fracNum?: number;     // 分数题：标准分子（可正负）
  fracDen?: number;     // 分数题：标准分母（>0）
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}

function intOps(allowNeg: boolean): Question {
  const ops = ["+", "-", "×", "÷"] as const;
  const op = ops[rand(0, 3)];
  let a = rand(allowNeg ? -20 : 1, 30);
  let b = rand(allowNeg ? -20 : 1, 30);
  let answer = 0;
  if (op === "+") answer = a + b;
  else if (op === "-") answer = a - b;
  else if (op === "×") {
    a = rand(allowNeg ? -12 : 2, 12);
    b = rand(allowNeg ? -12 : 2, 12);
    answer = a * b;
  } else {
    b = rand(2, 10);
    answer = rand(allowNeg ? -10 : 1, 10);
    a = b * answer;
  }
  const fmt = (n: number) => (n < 0 ? `(${n})` : `${n}`);
  return { prompt: `${fmt(a)} ${op} ${fmt(b)} = ?`, kind: "number", answer, tolerance: 0 };
}

function decimalQ(): Question {
  const a = (rand(10, 999) / 10);
  const b = (rand(10, 999) / 10);
  const ops = ["+", "-", "×"] as const;
  const op = ops[rand(0, 2)];
  let val: number;
  if (op === "+") val = a + b;
  else if (op === "-") val = a - b;
  else val = a * b;
  const answer = Math.round(val * 100) / 100;
  return {
    prompt: `${a.toFixed(1)} ${op} ${b.toFixed(1)} = ?`,
    kind: "number",
    answer,
    tolerance: 0.01,
  };
}

function fractionQ(): Question {
  const d1 = rand(2, 9);
  const n1 = rand(1, d1 - 1);
  const d2 = rand(2, 9);
  const n2 = rand(1, d2 - 1);
  const ops = ["+", "-", "×"] as const;
  const op = ops[rand(0, 2)];
  let num: number, den: number;
  if (op === "+") { num = n1 * d2 + n2 * d1; den = d1 * d2; }
  else if (op === "-") { num = n1 * d2 - n2 * d1; den = d1 * d2; }
  else { num = n1 * n2; den = d1 * d2; }
  const g = gcd(num, den);
  num = num / g;
  den = den / g;
  if (den < 0) { den = -den; num = -num; }
  return {
    prompt: `${n1}/${d1} ${op} ${n2}/${d2} = ?`,
    kind: "fraction",
    answer: num / den,
    tolerance: 1e-6,
    fracNum: num,
    fracDen: den,
  };
}

function exponentQ(): Question {
  const base = rand(2, 9);
  const exp = rand(2, 4);
  return { prompt: `${base}^${exp} = ?`, kind: "number", answer: Math.pow(base, exp), tolerance: 0 };
}

function rootQ(): Question {
  const r = rand(2, 15);
  return { prompt: `√${r * r} = ?`, kind: "number", answer: r, tolerance: 0 };
}

export function generateChallenge(
  hatched: boolean,
  modules: ChallengeModule[],
): Question[] {
  const pool: (() => Question)[] = [];
  if (!hatched) {
    // 孵化前：只考整数四则运算
    pool.push(() => intOps(false));
  } else {
    // 孵化后：必须按勾选的词条出题，不再混入基础整数运算
    if (modules.includes("negative")) pool.push(() => intOps(true));
    if (modules.includes("decimal")) pool.push(decimalQ);
    if (modules.includes("fraction")) pool.push(fractionQ);
    if (modules.includes("exponent")) pool.push(exponentQ);
    if (modules.includes("root")) pool.push(rootQ);
  }
  if (pool.length === 0) return [];
  const qs: Question[] = [];
  for (let i = 0; i < 10; i++) {
    qs.push(pool[rand(0, pool.length - 1)]());
  }
  return qs;
}

/** 校验数字答案 */
export function checkAnswer(q: Question, input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return false;
  return Math.abs(n - q.answer) <= q.tolerance + 1e-9;
}

/** 校验分数答案（分子/分母） */
export function checkFraction(q: Question, numStr: string, denStr: string): boolean {
  const num = Number(numStr.trim());
  const den = Number(denStr.trim());
  if (!Number.isFinite(num) || !Number.isFinite(den)) return false;
  if (den === 0) return false;
  return Math.abs(num / den - q.answer) <= 1e-6;
}
