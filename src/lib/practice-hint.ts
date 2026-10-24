/** Method-only hints reject numeric content and answer/option disclosures. */
export function isMethodOnlyHint(hint: string): boolean {
  return hint.trim().length > 0 &&
    !/[0-9０-９=＝<>≤≥]/.test(hint) &&
    !/(?:答案|结果|选项|选择|选)\s*(?:是|为|应为|为选项|选项)?\s*[A-EＡ-Ｅ]/i.test(hint) &&
    !/(?:等于|答案是|答案为|结果是|结果为)\s*[零〇一二两三四五六七八九十百千万负]/.test(hint);
}