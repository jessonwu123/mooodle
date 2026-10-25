export function validateMeetingPolishText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("请先粘贴会议纪要");
  if (value.length > 100000) throw new Error("纪要过长，请分段生成（最多100000字）");
  return value.trim();
}

export function canPolishMeeting(roles: string[]): boolean {
  return roles.includes("teacher") || roles.includes("admin");
}