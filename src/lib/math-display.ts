/** KaTeX uses its own array column spacing; TeX's @{\quad} preamble is unsupported. */
export function normalizeMathDisplay(source: string): string {
  return source.replace(
    /\\begin\{array\}\{((?:[lcr|\s]|@\{\s*\\(?:quad|qquad)\s*\})+)\}/g,
    (_match, columns: string) =>
      `\\begin{array}{${columns.replace(/@\{\s*\\(?:quad|qquad)\s*\}/g, "")}}`,
  );
}