# 一键更新（灵犀 CRM 课表同步）

## 功能流程

1. 教师端「课表」页头部新增按钮 **一键更新**（放在「导入 Excel」旁）。
2. 首次点击时若未绑定账号 → 弹窗输入 **用户名 / 密码**（tenantName 固定为「犀牛教育」），保存后立即执行同步。
3. 已绑定账号 → 直接同步；按钮旁另加一个「修改账号」小图标随时改。
4. 同步范围：**今天 −1 个月 ~ 今天 +6 个月**（在服务端计算）。
5. 结果弹窗：
   - 顶部一行汇总：`新增 X 节 · 删除 Y 节 · 保留 Z 节`
   - 两个可展开面板（Accordion）：
     - 新增课次：日期 / 时段 / 班级名
     - 删除课次：日期 / 时段 / 班级名
6. 关闭弹窗后课表自动刷新。

## 数据库

新增表 `teacher_xngj_credentials`（每位教师一行）：

- `user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `username text NOT NULL`
- `password text NOT NULL`（RLS 严格限制，仅教师本人和 service_role 可访问）
- `tenant_name text NOT NULL DEFAULT '犀牛教育'`
- `xngj_user_id text`（登录后回填的灵犀 userId，用于精确拉「我的课次」）
- `created_at / updated_at`

RLS：`auth.uid() = user_id` 的 SELECT/INSERT/UPDATE/DELETE 全套，加 `service_role` 全权。GRANT 齐全。

## 后端（TanStack `createServerFn`，均带 `requireSupabaseAuth`）

`src/lib/xngj.server.ts`
- `xngjLogin(username, password, tenantName)` → 调用 `POST /admin-api/system/auth/login`，返回 `{ accessToken, userId }`。
- `xngjFetchLessons(token, userId, start, end)` → 分页 `POST /admin-api/lms/class-schedule-server/arrange-lesson-page`，`pageSize=100`，循环直到取完。
- 将每条记录规范化为 `{ lesson_date, start_time, end_time, class_name }`：
  - `lesson_date` = `arrangeDate`
  - `times` 形如 `19:00-20:30` → 拆成 `start_time` / `end_time`，补 `:00` 秒
  - `class_name` = `className`（若空则回落 `lessonName`）

`src/lib/xngj.functions.ts`
- `getXngjCredentials()` → 返回 `{ configured: boolean, username?: string }`（不返回密码）。
- `saveXngjCredentials({ username, password })` → upsert，同时试登录一次校验；失败返回错误信息不写入。
- `runXngjSync()` →
  1. 读凭证；无则报错「请先绑定账号」。
  2. 登录拿 token + `xngj_user_id`（回填数据库）。
  3. 拉取 `[today-1mo, today+6mo]` 全部课次 → 规范化数组 `remote`。
  4. 查库 `imported_lessons where created_by = uid AND lesson_date BETWEEN [start,end]` → `local`。
  5. 用 key = `lesson_date|start_time|end_time|class_name` 做集合 diff：
     - `added` = remote − local → 批量 insert（带 `created_by`）
     - `deleted` = local − remote → 按 id 批量 delete
     - `kept` = local ∩ remote
  6. 返回 `{ added: Row[], deleted: Row[], keptCount: number }`。

按 `tanstack-serverfn-splitting`：`.functions.ts` 只放 `createServerFn` 声明，HTTP/diff 逻辑放 `.server.ts`。

## 前端

新组件 `src/components/xngj-sync-dialog.tsx`：
- 挂钩 `useServerFn`；对外只导出「一键更新」按钮 + 结果弹窗 + 凭证弹窗。
- 状态机：`idle → (need-creds? cred-dialog : syncing) → result-dialog`。
- 凭证弹窗：`username`（默认填之前保存的） / `password`（新填），zod 校验。
- 结果弹窗：Sonner toast 显示汇总，同时打开 `Dialog` + `Accordion`（复用现有 shadcn 组件）展示明细。
- 完成后触发 `admin.schedule.tsx` 现有的 `load()`。

在 `src/routes/admin.schedule.tsx` 顶栏按钮组挂 `<XngjSyncButton onDone={load} />`（导入 Excel 按钮旁），带「修改账号」二级按钮。

## 技术注意

- 灵犀接口 CORS 未开放，**必须走服务端**（`fetch` 在 Cloudflare Worker OK，纯 HTTP + Bearer，无 Node 依赖）。
- 密码明文存表，靠 RLS + `SUPABASE_SERVICE_ROLE_KEY` 隔离；同库其他学生凭证也是同款做法，与项目现状一致。
- 分页做安全上限（最多 100 页）防死循环。
- diff 只作用于时间窗内的行，窗外历史行不动。
- 全过程包 try/catch，任何 4xx/5xx 返回结构化错误到前端 toast。

## 交付物

- migration：`teacher_xngj_credentials` 表 + GRANT + RLS
- `src/lib/xngj.server.ts`、`src/lib/xngj.functions.ts`
- `src/components/xngj-sync-dialog.tsx`
- `src/routes/admin.schedule.tsx` 挂载按钮
