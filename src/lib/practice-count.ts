export function parsePracticeCount(value: string, maximum: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 1 && count <= maximum ? count : null;
}