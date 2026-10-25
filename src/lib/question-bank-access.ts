import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function assertQuestionBankEditor(context: { supabase: Pick<SupabaseClient<Database>, "rpc"> }) {
  const { data, error } = await context.supabase.rpc("can_edit_question_bank");
  if (error || data !== true) throw new Error("当前账号仅可使用和下载题库，请联系管理员开通题库编辑权限");
}