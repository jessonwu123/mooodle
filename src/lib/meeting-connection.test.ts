import { test } from "node:test";
import assert from "node:assert/strict";
import { canConnectMeetingPlugin } from "./meeting-connection";

test("已登录教师默认直接连接，无需手动授权", () => {
  assert.equal(canConnectMeetingPlugin(false, true, true, true), true);
});
test("未登录或非教师不能连接", () => {
  assert.equal(canConnectMeetingPlugin(false, false, true, true), false);
  assert.equal(canConnectMeetingPlugin(false, true, false, true), false);
});
test("登录确认中或主动断开时不能连接", () => {
  assert.equal(canConnectMeetingPlugin(true, true, true, true), false);
  assert.equal(canConnectMeetingPlugin(false, true, true, false), false);
});