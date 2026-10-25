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

export const MEETING_POLISH_IMAGE_LIMIT = 12; // 长图在插件内按原清晰度分段，段数上限
const MEETING_POLISH_IMAGE_MAX_CHARS = 5_500_000; // base64 data URL，约 4MB 图片
const MEETING_POLISH_IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function validateMeetingPolishImages(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("课堂笔记图片格式不正确");
  if (value.length > MEETING_POLISH_IMAGE_LIMIT) throw new Error(`课堂笔记图片最多 ${MEETING_POLISH_IMAGE_LIMIT} 张`);
  return value.map((item) => {
    if (typeof item !== "string" || !MEETING_POLISH_IMAGE_PATTERN.test(item)) throw new Error("课堂笔记图片仅支持 JPG、PNG 或 WebP");
    if (item.length > MEETING_POLISH_IMAGE_MAX_CHARS) throw new Error("课堂笔记图片过大，请压缩后重试（每张不超过 4MB）");
    return item;
  });
}