export function canDownloadFolder(level: string, isAncestor = false) {
  return !isAncestor && ["download", "upload", "manage"].includes(level);
}

export function chooseRandomQuestions(pool: string[], selected: string[], count: number) {
  const available = [...new Set(pool)].filter((id) => !selected.includes(id));
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = available[i], b = available[j];
    if (a === undefined || b === undefined) continue;
    available[i] = b;
    available[j] = a;
  }
  return available.slice(0, Math.max(0, Math.floor(count)));
}