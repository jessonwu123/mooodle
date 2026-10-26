/** 账号列表排序：最近登录的排最前，从未登录过的排最后，同为未登录按创建时间倒序。 */
export function compareAccountsByLastSignIn(
  a: { last_sign_in_at: string | null; created_at: string },
  b: { last_sign_in_at: string | null; created_at: string },
): number {
  if (a.last_sign_in_at && b.last_sign_in_at) {
    return b.last_sign_in_at.localeCompare(a.last_sign_in_at);
  }
  if (a.last_sign_in_at) return -1;
  if (b.last_sign_in_at) return 1;
  return b.created_at.localeCompare(a.created_at);
}
