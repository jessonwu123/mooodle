export type CalcImportRow = { stem: string; answer: string; tags: string[] };

export function validateCalcMath(text: string): void {
  const dollars = text.match(/(?<!\\)(?:\\\\)*\$/g) ?? [];
  if (dollars.length % 2 !== 0) throw new Error("公式的 $ 标记未成对，请检查导入内容");
}

export function calcRowFromCells(cells: string[]): CalcImportRow | null {
  const stem = (cells[0] ?? "").trim();
  if (!stem || stem === "题干" || stem === "题目") return null;
  if (cells.slice(3).some((cell) => cell.trim())) throw new Error("每行最多三列：题干、答案、知识点，请检查文件分列");
  validateCalcMath(stem);
  validateCalcMath(cells[1] ?? "");
  return {
    stem,
    answer: (cells[1] ?? "").trim(),
    tags: (cells[2] ?? "").split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean),
  };
}

// Never let spreadsheet delimiter auto-detection interpret TeX pipes as columns.
export function parseCalcCsv(text: string): CalcImportRow[] {
  const source = text.replace(/^\uFEFF/, "");
  let inQuotes = false;
  let inMath = false;
  let hasTab = false;
  let hasComma = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (inQuotes && source[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === "\n" || char === "\r") break;
      if (char === "$" && source[i - 1] !== "\\") inMath = !inMath;
      if (char === "\t") hasTab = true;
      if (char === "," && !inMath) hasComma = true;
    }
  }
  const delimiter = hasTab ? "\t" : hasComma ? "," : null;
  if (!delimiter) return parseCalcLines(source);
  const rows: CalcImportRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  const finishRow = () => {
    cells.push(cell);
    const row = calcRowFromCells(cells);
    if (row) rows.push(row);
    cells = []; cell = "";
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === "") quoted = !quoted;
      else cell += char;
    } else if (char === delimiter && !quoted) {
      cells.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i++;
      finishRow();
    } else cell += char;
  }
  if (quoted) throw new Error("CSV 引号未成对，请检查文件");
  if (cell || cells.length) finishRow();
  return rows;
}

// Pipes inside TeX math are absolute-value symbols, not column separators.
export function parseCalcLines(text: string): CalcImportRow[] {
  const rows: CalcImportRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const cells: string[] = [];
    let cell = "";
    let inMath = false;
    const tabSeparated = raw.includes("\t");
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i] ?? "";
      let slashes = 0;
      for (let j = i - 1; j >= 0 && raw[j] === "\\"; j--) slashes++;
      const escaped = slashes % 2 === 1;
      if (char === "$" && !escaped) {
        inMath = !inMath;
        if (raw[i + 1] === "$") { cell += "$"; i++; }
      }
      if ((tabSeparated ? char === "\t" : (char === "|" || char === "｜") && !inMath && !escaped)) {
        cells.push(cell.trim()); cell = "";
      } else cell += char;
    }
    if (inMath) throw new Error("公式的 $ 标记未成对，请检查导入内容");
    cells.push(cell.trim());
    if (cells.length > 3) throw new Error("每行最多三列；绝对值公式请放在成对的 $ 中，或使用 Excel 三列导入");
    const row = calcRowFromCells(cells);
    if (row) rows.push(row);
  }
  return rows;
}