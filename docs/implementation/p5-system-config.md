# p5-system-config 实施报告（2026-10-05）

目录：`work/ui-p5`；分支：`phase-5/admin`。按批准 spec §1–§7 及用户的 NOTE-1/NOTE-2 收敛实施。前端代码与目标测试已交付，真实后端验收和浏览器实测仍未完成，不能宣布 checklist 全部通过。后端只读，未改依赖、锁文件、共享 AppModal/form-guard，未执行 git add/commit。

## 文件清单

新增实现（9 个）：

- `src/routes/sys/configs.tsx`：AppShell + Outlet 布局，继承 `/sys` 的 beforeLoad/guardAccess。
- `src/routes/sys/configs/index.tsx`：系统配置列表入口；用户地址 `/sys/configs`。
- `src/components/pm/system-config-list-live.tsx`：configKey/configType 草稿与已应用筛选、搜索/Enter/重置、服务端分页、失败重试、严格 enabled 行操作、epoch 秒时间、值摘要和原文弹窗。
- `src/components/pm/system-config-form-dialog.tsx`：详情回填、会话与版本隔离、独立 dirty 守卫、预检、保存和读取验证。
- `src/components/pm/system-config-value-field.tsx`：受控 string/number/boolean/json 输入；不请求 API。
- `src/lib/system-config-form.ts`：初始/回填/raw 快照、全字段校验、String 值规范化、载荷白名单、切形态、预检适用性/结果映射、保存读回比对。
- `src/lib/system-config-query.ts`：UI/wire 类型及标签、分页/筛选规范化、严格布尔状态和正安全 ID。
- `src/lib/query/hooks/useSystemConfigs.ts`：列表/详情/按键查询、四个写 mutation 和两个新鲜预检 mutation；执行时权限检查、无权数据遮蔽、system.all 失效。
- `src/lib/query/hooks/useConfigsByType.ts`：共享 options/hook，UI 类型统一映射至请求与 key；保留原始 configValue String，非管理员无请求/缓存数据。

新增测试（5 个）：

- `src/lib/__tests__/system-config-form.test.ts`（38 项）。
- `src/lib/__tests__/system-config-query.test.ts`（19 项）。
- `src/lib/query/__tests__/system-configs.test.tsx`（15 项，真实 QueryClient/Observer）。
- `src/components/pm/__tests__/system-config-forms.test.tsx`（36 项，沿用 dictionary-hook-harness 的可控 hook/callback 测试）。
- `src/components/pm/__tests__/system-config-route.test.tsx`（6 项，sys 父 guard、旧菜单 alias、导航和生成路由）。

新增浏览器专项：`scripts/system-config.browser.mjs`（9 项 fixture 专项，语法检查通过，未执行浏览器测试）。覆盖四个主动关闭入口、真实路由 blocker、浏览器后退/前进、原生刷新/关闭提示、四种输入、保存失败/读取重试和重新布防；不代表真实后端联调。

新增报告：`docs/implementation/p5-system-config.md`（本文）。

修改（6 个）：

- `src/lib/api/__tests__/system-contract.test.ts`：逐个补齐 13 个配置方法契约，另补空 bean/白名单范围、0/null/畸形值及错误响应测试；新增 16 项，全文件 98 项。
- `src/lib/api/system-types.ts`：纠正存储类型注释，保留可空字段及已有真实 DTO。
- `src/lib/query/keys.ts`：登记四种配置 kind 与全域写后失效约定。
- `src/lib/query/index.ts`：导出管理 hooks、读回 options 和共享按类型入口。
- `src/lib/access/route-manifest.ts`：policy=menu、`/system/config` alias；只映射菜单，不创建老路径页面。
- `src/routeTree.gen.ts`：由现有 Vite/TanStack 工具生成并注册布局/索引路由，没有手改。

现有 `src/lib/api/system.ts` 的 13 方法路径、动词、编码和响应类型实读核对后原样复用；没有第二个客户端，没有 delete/batch/import/export 管理方法或列表按钮。

## spec §7 逐项核对

| 步骤 | 实施与验证 |
| --- | --- |
| 1. 客户端契约 + 类型/载荷纯函数 | 完成。13 方法逐一验证 `/api/systemConfig/v1` 路径、HTTP 动词、body/query 和 `code=1/result`；Long 创建 ID、成功 String 更新/启停、false/null、分页、数组、Map 均覆盖。纯函数覆盖四类、边界、白名单、description 空字符串、enabled=false、memo 省略、安全 ID 和 raw dirty。 |
| 2. 管理 hooks + 列表/筛选 | 完成前端实施和 mock/Observer 验证。参数使用 `{page,pageSize,bean}`，只含 configKey/configType；草稿不逐键请求，同参搜索 refetch，分页真实换 key。服务端筛选实际生效 BLOCKED/待联调确认，不做本地当前页过滤。 |
| 3. 表单 + 四形态 + UX | 完成组件/纯函数测试。findById 回填禁用记录；四个必填/boolean isRequired、FieldError、多错/编辑清错、fresh 唯一性与适用远程预检、会话/版本检查、防重入及迟到响应隔离。blocker/dialog 是 AppModal 外常驻兄弟节点；主动关闭统一 guard；写成功先 markClean，失败保留 dirty。保存后读回失败锁住保存并只提供读取重试。浏览器实测 BLOCKED。 |
| 4. valid/invalid 行操作 | 完成前端和目标测试。严格 true/false 分别禁用/启用，null 未知无猜测操作；重复点击防重入，写成功全域重取，失败反馈。真实启停验收 BLOCKED。 |
| 5. 共享按类型 hook + 路由 | 完成。同类型共享缓存、不同类型隔离，四个写成功均失效列表/详情/按键及所有类型，活跃旧/新类型重取；失败和预检不失效。无权不启用、不暴露已有 data，手动 refetch/mutate 执行时检查。alias/导航/sys guard/routeTree 目标测试通过。 |
| 6. 真实 CRUD/读回 + 定向回归 | 定向回归通过（15 文件、322 项）；typecheck 零新增诊断、定向 ESLint 通过。build:dev 被两个既有 HeroUI 导出错误阻断。真实后端 §6.4 未做，无后端环境；浏览器未运行，无可监听 dev server。此步骤未完整验收。 |

后台详情重取：干净表单可回填；脏表单不自动更新任何草稿字段或 baseline，显示“复核后台更新”。显式复核后合并最新未改字段、保留用户已改 raw 字段，并建立最新基线；旧版本不能直接写入。预检期间版本变化先中止并要求复核。

保存读回：启用记录核对 id/key/type/value/name/description/enabled；禁用记录先验证 getConfigByKey 为 null，再通过 findById 核对保存内容。读取失败提示“已保存，读取验证失败”，重试不会重发 create/update，读取状态和结果受同一会话限制。

## NOTE 收敛与后端证据优先

- **NOTE-1**：`configTypeLabel` 显式定义 STRING→字符串、INTEGER→数字（整数）、BOOLEAN→布尔、JSON→JSON；大小写识别已知类型；NUMBER/null/其它未知值保留原值并显示“未知类型，请核对”，不冒充 INTEGER。
- **NOTE-2**：`buildSystemConfigUpdatePayload` 在类型字段与初始展示值相同时省略 configType，保留存储大小写；未知类型原样回填和提示，本地校验阻止盲目保存，必须明确选支持的类型才能转换并发送。不会把未知类型被动归一后写入。
- **返回类型冲突**：任务摘要称“Create/Update 返回 Long”，但只读 `SystemConfigController.java:54–57` 是 `Result<Long>` 创建，`:66–70` 是 `Result<String>` 更新；更新 service 本身为 void。遵循用户的“后端证据优先”要求与 spec §3.3，保留现有客户端 update 返回 string，保存 ID 使用编辑上下文，不把更新成功 String 当 ID。valid/invalid 同样返回成功 String。
- **起草阶段文字**：spec 中保留“本次只起草/不创建实施文件”等描述，本轮按用户明确实施指令执行。
- 未改共享守卫、没有新权限字符串、未发送 memo、清 description 发送 `""`、false 不丢。类型切换保留 raw 值，只在明确可解析的 boolean 文本切形态时归一；dirty 不做 trim/JSON.stringify。

## 验证命令与结果

以下命令均在 `work/ui-p5` 执行。输出行数按捕获日志的 `wc -l`；typecheck 诊断计数按 `^src/.*error TS` 主诊断行计，不以堆栈/续行计数。

核心及定向回归：

```bash
pnpm exec vitest run \
  src/lib/api/__tests__/system-contract.test.ts \
  src/lib/__tests__/system-config-form.test.ts \
  src/lib/__tests__/system-config-query.test.ts \
  src/lib/query/__tests__/system-configs.test.tsx \
  src/components/pm/__tests__/system-config-forms.test.tsx \
  src/components/pm/__tests__/system-config-route.test.tsx \
  src/lib/query/__tests__/dictionaries.test.tsx \
  src/lib/query/__tests__/dictionary-items.test.tsx \
  src/components/pm/__tests__/dictionary-forms.test.tsx \
  src/components/pm/__tests__/dictionary-list.test.tsx \
  src/components/pm/__tests__/dictionary-items.test.tsx \
  src/components/pm/__tests__/dictionary-route.test.tsx \
  src/lib/access/__tests__/route-manifest.test.ts \
  src/lib/access/__tests__/snapshot.test.ts \
  src/lib/access/__tests__/access-route.test.tsx
```

```text
Test Files  15 passed (15)
     Tests  322 passed (322)
```

全部通过，exit 0；输出 24 行。早期独立核心命令（§6.1/§6.2 三文件）结果为 3 passed、155 passed。最终目标加字典及权限导航回归覆盖完整 §6.1–§6.3 的可运行单元/组件/Observer 检查，未以这些结果代替浏览器实测。

| 检查 | 结果 | 输出行数 / 证据 |
| --- | --- | --- |
| `pnpm typecheck`（改动前基线） | exit 2，22 条既有主诊断 | 51 行；`/tmp/p5-config-typecheck-before.log` |
| `pnpm typecheck`（实施后） | exit 2，同样 22 条；主诊断集合逐行比较新增 0，改动文件诊断 0 | 51 行；`/tmp/p5-config-typecheck.log` |
| 上述 Vitest 命令 | exit 0，15 文件/322 项通过 | 24 行；`/tmp/p5-config-tests.log` |
| 下述定向 ESLint | exit 0，0 errors / 0 warnings | 0 行；`/tmp/p5-config-eslint.log` |
| `pnpm build:dev` | exit 1，2 个既有 MISSING_EXPORT | 42 行；`/tmp/p5-config-build.log` |
| `pnpm exec node --check scripts/system-config.browser.mjs` | exit 0，仅语法检查 | 0 行；不代表浏览器通过 |
| `git diff --check` | exit 0 | 0 行 |
| `pnpm dev` | exit 1，listen EPERM `0.0.0.0:8080` | 17 行；`/tmp/p5-config-dev.log` |

定向 ESLint：

```bash
pnpm exec eslint \
  src/components/pm/system-config-form-dialog.tsx \
  src/components/pm/system-config-list-live.tsx \
  src/components/pm/system-config-value-field.tsx \
  src/components/pm/__tests__/system-config-forms.test.tsx \
  src/components/pm/__tests__/system-config-route.test.tsx \
  src/lib/system-config-form.ts src/lib/system-config-query.ts \
  src/lib/__tests__/system-config-form.test.ts src/lib/__tests__/system-config-query.test.ts \
  src/lib/query/hooks/useSystemConfigs.ts src/lib/query/hooks/useConfigsByType.ts \
  src/lib/query/__tests__/system-configs.test.tsx \
  src/lib/api/__tests__/system-contract.test.ts src/lib/api/system-types.ts \
  src/lib/access/route-manifest.ts src/lib/query/index.ts src/lib/query/keys.ts \
  src/routes/sys/configs.tsx src/routes/sys/configs/index.tsx \
  scripts/system-config.browser.mjs
```

生成的 `src/routeTree.gen.ts` 按仓库 ESLint 配置排除，不手动 lint 生成代码。既有 typecheck 错误集中于 `pmItemOrigin`/`@tanstack/history` 声明及 login/projects 的旧 HeroUI 用法。构建的两个错误来自未改的 `src/routes/login.tsx:2`、`src/routes/projects.tsx:2` 对 HeroUI v3 不存在的 CardBody 导入；没有越界修复这些页面，也没有声称全量 typecheck/build 通过。`/tmp` 日志是当前会话临时证据，worker 可用上面的完整命令重跑。

## 未核与阻断

1. **真实后端 §6.4：BLOCKED/未做**，本环境无可用后端；没有运行会改变系统数据的真实联调。四类型 CRUD、竞争重复键的真实 HTTP/code/msg、禁用/启用、改键/类型与缓存一致性尚需 worker 验收。
2. **真实分页筛选：待联调确认/验收未通过**。只读 `SystemConfigServiceImpl.java:100–105` 构建空 LambdaQueryWrapper；前端传 DTO 和独立 key 并不能证明实际筛选。需多页、多键、多类型数据验证 pageNumber/total/筛选效果；不使用当前页本地过滤绕过。
3. **浏览器 §6.3：BLOCKED**。dev server 被运行环境 EPERM 阻断。不能声称 HeroUI X/遮罩/Escape、两层确认、路由 Link、浏览器后退/前进、刷新/关闭及重新布防已实测。worker 启动页面后运行 `pnpm exec node scripts/system-config.browser.mjs`；脚本为 fixture，仍须在真实环境完成验收。
4. **能力边界待联调**：长 JSON GET URL 长度、数据库长度/collation、存量类型的大小写匹配、更新竞争与错误消息。JSON 本地校验比后端 `{`/`[` 前缀浅校验严格，数字只承诺 32 位整数；没有臆造 POST 校验端点或后端筛选能力。
5. **全量构建阻断**：既有 CardBody 导出错误；**全量类型检查未通过**：22 条既有错误。本次新增错误为 0，保留原问题，不用忽略规则掩盖。

除后端证据优先处理的更新返回类型、用户明确实施覆盖起草文字及上述环境阻断外，没有未说明的范围扩展或 spec 偏离。
