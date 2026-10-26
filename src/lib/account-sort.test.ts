import { test } from "node:test";
import assert from "node:assert/strict";
import { compareAccountsByLastSignIn } from "./account-sort.ts";

test("最近登录的排在从未登录的前面", () => {
  const logged = { last_sign_in_at: "2026-10-01T00:00:00Z", created_at: "2020-01-01T00:00:00Z" };
  const never = { last_sign_in_at: null, created_at: "2026-10-25T00:00:00Z" };
  assert.ok(compareAccountsByLastSignIn(logged, never) < 0);
});

test("两个已登录账号按最近登录时间倒序", () => {
  const earlier = { last_sign_in_at: "2026-10-20T00:00:00Z", created_at: "2026-01-01T00:00:00Z" };
  const later = { last_sign_in_at: "2026-10-25T00:00:00Z", created_at: "2020-01-01T00:00:00Z" };
  assert.ok(compareAccountsByLastSignIn(later, earlier) < 0);
  assert.ok(compareAccountsByLastSignIn(earlier, later) > 0);
});

test("两个从未登录的账号按创建时间倒序", () => {
  const older = { last_sign_in_at: null, created_at: "2026-01-01T00:00:00Z" };
  const newer = { last_sign_in_at: null, created_at: "2026-10-25T00:00:00Z" };
  assert.ok(compareAccountsByLastSignIn(newer, older) < 0);
});
