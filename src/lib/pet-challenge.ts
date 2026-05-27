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

export interface Question {
  prompt: string;
  answer: number; // 数值（小数四舍五入到 2 位）
  tolerance: number;
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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
    // ÷ 保证整除
    b = rand(2, 10);
    answer = rand(allowNeg ? -10 : 1, 10);
    a = b * answer;
  }
  const fmt = (n: number) => (n < 0 ? `(${n})` : `${n}`);
  return { prompt: `${fmt(a)} ${op} ${fmt(b)} = ?`, answer, tolerance: 0 };
}

function decimalQ(): Question {
  const a = (rand(10, 999) / 10);
  const b = (rand(10, 999) / 10);
  const ops = ["+", "-"] as const;
  const op = ops[rand(0, 1)];
  const answer = Math.round((op === "+" ? a + b : a - b) * 100) / 100;
  return { prompt: `${a.toFixed(1)} ${op} ${b.toFixed(1)} = ?（小数）`, answer, tolerance: 0.01 };
}

function fractionQ(): Question {
  const d1 = rand(2, 9);
  const n1 = rand(1, d1 - 1);
  const d2 = rand(2, 9);
  const n2 = rand(1, d2 - 1);
  const ops = ["+", "-"] as const;
  const op = ops[rand(0, 1)];
  const val = op === "+" ? n1 / d1 + n2 / d2 : n1 / d1 - n2 / d2;
  return {
    prompt: `${n1}/${d1} ${op} ${n2}/${d2} = ?（写成小数，保留两位）`,
    answer: Math.round(val * 100) / 100,
    tolerance: 0.01,
  };
}

function exponentQ(): Question {
  const base = rand(2, 9);
  const exp = rand(2, 4);
  return { prompt: `${base}^${exp} = ?`, answer: Math.pow(base, exp), tolerance: 0 };
}

function rootQ(): Question {
  const r = rand(2, 15);
  return { prompt: `√${r * r} = ?`, answer: r, tolerance: 0 };
}

export function generateChallenge(
  hatched: boolean,
  modules: ChallengeModule[],
): Question[] {
  const pool: (() => Question)[] = [];
  // 基础：整数四则运算（始终有）
  pool.push(() => intOps(false));
  if (hatched) {
    if (modules.includes("negative")) pool.push(() => intOps(true));
    if (modules.includes("decimal")) pool.push(decimalQ);
    if (modules.includes("fraction")) pool.push(fractionQ);
    if (modules.includes("exponent")) pool.push(exponentQ);
    if (modules.includes("root")) pool.push(rootQ);
  }
  const qs: Question[] = [];
  for (let i = 0; i < 10; i++) {
    qs.push(pool[rand(0, pool.length - 1)]());
  }
  return qs;
}

/** 检查答案 */
export function checkAnswer(q: Question, input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const n = Number(trimmed);
  if (Number.isNaN(n)) return false;
  return Math.abs(n - q.answer) <= q.tolerance + 1e-9;
}
