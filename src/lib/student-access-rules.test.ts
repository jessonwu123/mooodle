import { test } from "node:test";
import assert from "node:assert/strict";
import { generateInviteCode, isRestricted, isValidInviteCode, LIMITED_HINT_DAILY, UPGRADE_WECHAT } from "./student-access-rules";

test("limited students get 10 hints per day", () => {
  assert.equal(LIMITED_HINT_DAILY, 10);
});
test("upgrade contact is the WeChat jessonwu123", () => {
  assert.equal(UPGRADE_WECHAT, "jessonwu123");
});
test("restricts only a limited account viewing itself", () => {
  assert.equal(isRestricted("limited", true), true);
  assert.equal(isRestricted("full", true), false);
  assert.equal(isRestricted("limited", false), false);
});
test("invite codes are exactly six digits", () => {
  assert.equal(isValidInviteCode("012345"), true);
  assert.equal(isValidInviteCode("12345"), false);
  assert.equal(isValidInviteCode("12a456"), false);
  assert.equal(generateInviteCode(() => 0.000042), "000042");
  assert.match(generateInviteCode(() => 0.999999), /^[0-9]{6}$/);
});
