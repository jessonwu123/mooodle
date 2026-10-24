import { describe, expect, it } from "bun:test";
import { generateInviteCode, isRestricted, isValidInviteCode, LIMITED_HINT_DAILY, UPGRADE_WECHAT } from "./student-access-rules";

describe("student access rules", () => {
  it("limited students get 10 hints per day", () => {
    expect(LIMITED_HINT_DAILY).toBe(10);
  });
  it("upgrade contact is the WeChat jessonwu123", () => {
    expect(UPGRADE_WECHAT).toBe("jessonwu123");
  });
  it("restricts only a limited account viewing itself", () => {
    expect(isRestricted("limited", true)).toBe(true);
    expect(isRestricted("full", true)).toBe(false);
    expect(isRestricted("limited", false)).toBe(false);
  });
  it("invite codes are exactly six digits", () => {
    expect(isValidInviteCode("012345")).toBe(true);
    expect(isValidInviteCode("12345")).toBe(false);
    expect(isValidInviteCode("12a456")).toBe(false);
    expect(generateInviteCode(() => 0.000042)).toBe("000042");
    expect(generateInviteCode(() => 0.999999)).toMatch(/^[0-9]{6}$/);
  });
});
