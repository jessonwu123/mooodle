export type LibraryPaperSortKey = {
  year: number | null;
  name: string;
  kind: "paper" | "answer";
};

const kindOrder: Record<LibraryPaperSortKey["kind"], number> = {
  paper: 0,
  answer: 1,
};

/** 资料库试卷按年份从早到晚排列；没有年份的排在最后，同年内先试卷后答案。 */
export function sortLibraryPapersByYear<T extends LibraryPaperSortKey>(papers: T[]): T[] {
  return [...papers].sort((a, b) => {
    const aYear = a.year ?? Number.MAX_SAFE_INTEGER;
    const bYear = b.year ?? Number.MAX_SAFE_INTEGER;
    if (aYear !== bYear) return aYear - bYear;
    if (kindOrder[a.kind] !== kindOrder[b.kind]) return kindOrder[a.kind] - kindOrder[b.kind];
    return a.name.localeCompare(b.name, "zh");
  });
}
