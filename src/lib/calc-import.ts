export type CalcImportRow = { stem: string; answer: string; tags: string[] };

export function calcRowFromCells(cells: string[]): CalcImportRow | null {
  const stem = (cells[0] ?? "").trim();
  if (!stem || stem === "题干" || stem === "题目") return null;
  return {
    stem,
    answer: (cells[1] ?? "").trim(),
    tags: (cells[2] ?? "").split(/[,，、;；]/).map((s) => s.trim()).filter(Boolean),
  };
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