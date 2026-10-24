/** Rules for self-registered (limited) student accounts and teacher invite codes. */
export const LIMITED_HINT_DAILY = 10;
export const UPGRADE_WECHAT = "jessonwu123";
export const UPGRADE_MESSAGE = `如需使用此功能，请添加微信 ${UPGRADE_WECHAT}`;
export const LIMITED_ERROR_PREFIX = "LIMITED:";

export type AccessLevel = "full" | "limited";

/** Restrictions apply only when the student is viewing their own limited account. */
export function isRestricted(level: string | null | undefined, isOwner: boolean): boolean {
  return isOwner && level === "limited";
}

export function isValidInviteCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code);
}

export function generateInviteCode(random: () => number = Math.random): string {
  return String(Math.floor(random() * 1_000_000)).padStart(6, "0");
}
