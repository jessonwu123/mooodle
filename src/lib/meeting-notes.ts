export function mergeMeetingNotes(existing: string, incoming: string, mode: "append" | "replace") {
  if (typeof incoming !== "string" || !incoming.trim() || incoming.length > 100000) throw new Error("请检查会议纪要内容");
  if (mode !== "append" && mode !== "replace") throw new Error("请选择追加或替换");
  return mode === "replace" || !existing.trim() ? incoming.trim() : `${existing}\n\n${incoming.trim()}`;
}