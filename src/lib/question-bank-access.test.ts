import { test } from "node:test";
import assert from "node:assert/strict";
import { assertQuestionBankEditor } from "./question-bank-access";

function context(data: boolean | null, error: unknown = null) {
  return { supabase: { rpc: async (name: string) => {
    assert.equal(name, "can_edit_question_bank");
    return { data, error };
  } } } as unknown as Parameters<typeof assertQuestionBankEditor>[0];
}
test("new teacher with no editing grant cannot add, modify or delete bank content", async () => {
  await assert.rejects(assertQuestionBankEditor(context(false)), /仅可使用和下载/);
});
test("admin-granted teacher can edit bank content", async () => {
  await assert.doesNotReject(assertQuestionBankEditor(context(true)));
});
test("revoked permission denies bank edits", async () => {
  await assertQuestionBankEditor(context(true));
  await assert.rejects(assertQuestionBankEditor(context(false)), /管理员/);
});
test("failed or missing permission lookup never grants editing", async () => {
  await assert.rejects(assertQuestionBankEditor(context(null)));
  await assert.rejects(assertQuestionBankEditor(context(true, new Error("unavailable"))));
});