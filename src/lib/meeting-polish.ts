export function validateMeetingPolishText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("请先粘贴会议纪要");
  if (value.length > 100000) throw new Error("纪要过长，请分段生成（最多100000字）");
  return value.trim();
}

export function canPolishMeeting(roles: string[]): boolean {
  return roles.includes("teacher") || roles.includes("admin");
}

export function validateMeetingPolishLanguage(value: unknown): "zh" | "en" {
  if (value === undefined) return "zh";
  if (value === "zh" || value === "en") return value;
  throw new Error("请选择中文或英文反馈");
}

export function withMeetingPolishLanguage(instructions: string, language: "zh" | "en"): string {
  if (language === "zh") return instructions;
  return `${instructions}\n输出语言选择：英文。仅将上述要求中的“中文课堂反馈”改为英文课堂反馈；所有小节标题、案例分析、巩固建议与通用学习技巧均用自然英文表达，数学公式、姓名及必要专有名词保留。上述诊断深度、证据分级、内容范围、结构、格式及禁止提醒语等其他要求全部不变。只输出英文反馈正文。`;
}