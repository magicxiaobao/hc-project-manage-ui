# p5-permission-list 实施报告

实施范围：`/sys/permissions` 权限点管理页；依据 `hidden_files/specs/p5-p5-permission-list.md` §3–§7。源码改动保留在本 worktree，未执行 git add/commit，未修改 backend-ro 或 API HTTP 封装。

## 文件清单

新增（13 个，含本报告）：

| 文件 | 用途 |
| --- | --- |
| `src/routes/sys/permissions.tsx` | 同步 hydrate、登录 redirect、system:admin 守卫、AppShell/Outlet |
| `src/routes/sys/permissions/index.tsx` | 权限列表入口 |
| `src/components/pm/permission-list-live.tsx` | 完整数据列表、三条件搜索、20 条展示分页、持续挂载表单、三种单行确认 |
| `src/components/pm/permission-form-dialog.tsx` | 六字段表单、findById 回填、dirty 守卫、编码预检、详情版本与会话保护 |
| `src/lib/permission-form.ts` | 快照、全部字段校验、载荷、变基、完整分页读取、本地筛选/分页、唯一性及错误决策、展示与确认文案 |
| `src/lib/query/hooks/usePermissions.ts` | 完整列表、详情及五种 mutation，成功失效 system 域 |
| `src/lib/__tests__/permission-form.test.ts` | 45 条纯逻辑测试 |
| `src/lib/query/__tests__/permissions.test.tsx` | 24 条 hooks/QueryObserver/失效测试 |
| `src/components/pm/__tests__/permission-list.test.tsx` | 8 条静态组件测试 |
| `src/components/pm/__tests__/permission-route.test.tsx` | 3 条 beforeLoad 守卫测试 |
| `scripts/permission-list.browser.mjs` | 待 worker 执行的 Playwright 受控 API 浏览器交互用例 |
| `vitest.config.ts` | 测试时解析 `@/`；不加载应用构建插件，支持真实组件静态渲染及路由测试 |
| `docs/implementation/p5-permission-list.md` | 本报告 |

修改（3 个）：

| 文件 | 改动 |
| --- | --- |
| `src/lib/query/index.ts` | 导出权限管理 hooks 和全量预检辅助函数 |
| `src/routeTree.gen.ts` | 已由现有 Vite/TanStack 路由生成流程更新，包含布局和 index |
| `src/lib/api/__tests__/system-contract.test.ts` | 补六字段、分页、详情、无 body POST、HTTP400 信封测试；纠正原有“物理删除”的错误测试名称 |

## 自检命令与结果

针对本项及角色权限回归：

```sh
pnpm exec vitest run src/lib/__tests__/permission-form.test.ts src/lib/query/__tests__/permissions.test.tsx src/components/pm/__tests__/permission-list.test.tsx src/components/pm/__tests__/permission-route.test.tsx src/lib/api/__tests__/system-contract.test.ts src/lib/__tests__/role-form.test.ts src/lib/__tests__/role-permissions.test.ts src/lib/query/__tests__/role-permissions.test.tsx src/components/pm/__tests__/role-permission-tree.test.tsx
```

结果：exit 0；`Test Files 9 passed (9)`、`Tests 208 passed (208)`；输出 18 行。之后修正 hooks 测试中读取 observer 配置的 TS 类型断言，并以以下更大范围回归验证最终代码。该回归也核验了新增 Vitest alias 配置对现有测试的影响。

```sh
pnpm exec vitest run src/lib/api/__tests__ src/lib/__tests__ src/lib/query/__tests__ src/components/pm/__tests__
```

最终结果：exit 0；`Test Files 28 passed (28)`、`Tests 487 passed (487)`；输出 37 行。覆盖全部新增单元/契约/hooks/静态渲染/路由守卫测试，以及既有角色表单、角色权限树、查询基础设施和 API 回归。

```sh
pnpm typecheck
```

最终结果：exit 2；输出 51 行，22 条既有 TS 错误，改动文件错误 0 条。实施前已直接运行 typecheck 记录这 22 条错误，最终错误的文件、行号、错误码和首行内容与原有记录逐行一致。既有错误分布：13 条事项导航 HistoryState / `@tanstack/history` 问题，4 条登录页 HeroUI API 问题，5 条项目页 HeroUI API 问题。**未宣称全项目 typecheck 通过。**

```sh
pnpm run build:dev
```

结果：exit 1；输出 42 行，2 个既有构建错误：`src/routes/login.tsx` 和 `src/routes/projects.tsx` 引用 HeroUI 3 未导出的 `CardBody`。构建在失败前完成路由生成及 3830 个模块转换；没有本项新增文件的构建报错。为保持实施范围，未修改这两个既有页面。

```sh
pnpm exec node --check scripts/permission-list.browser.mjs
git diff --check
```

结果：均 exit 0、无错误输出。浏览器脚本只完成语法检查，**未执行其交互用例**。

## spec §7 逐项核对

| 步骤 | 实施状态 | 验证与限制 |
| --- | --- | --- |
| 1 固定后端契约、扩展 API 契约测试 | 完成 | 沿用 `/permission/v1` 原方法/DTO；create/update 六字段、分页 body、无 body POST、HTTP400 错误信封均测试通过；未新增 HTTP 封装 |
| 2 permission-form 纯逻辑 | 完成 | 45 条测试通过；0/100/101/201 条、实际分页大小、部分页失败、重复/不推进页、id 去重排序、筛选 AND、20 条分页、校验边界、null enabled、空字符串及谨慎错误决策 |
| 3 hooks 及注册 | 完成 | 24 条测试通过；system 工厂 key、认证与非法 ID 门禁、详情 ID 校验、迟到详情隔离、预检读取所有分页、五种成功失效及失败不改缓存；既有树/分配回归通过 |
| 4 PermissionFormDialog 与表单 UX | 实施完成；动态交互待验收 | 六字段快照；`useUnsavedChangesGuard(open && dirty)`；blocker 和 discard dialog 均在 AppModal 外独立挂载；统一 busy/guard 关闭；成功先 markClean；全量预检与详情版本/令牌检查。静态标签及加载/错误/关闭分支通过；浏览器关闭/路由/在途交互未做 |
| 5 列表、确认与路由 | 实施完成；动态交互待验收 | 输入与 submitted 分开；搜索/Enter 应用、重置回 1、刷新越界夹紧；八列/null/秒级时间；首次加载、空数据、无匹配、刷新失败区分；三个操作准确文案、pending 关闭拦截、失败保留确认及可重试。静态渲染与 beforeLoad 守卫通过；真实浏览器交互未做 |
| 6 测试、typecheck、构建及后端联调 | 部分完成 | 487 条测试通过；typecheck 零新增、22 条既有错误；构建 BLOCKED 于既有 CardBody；浏览器交互与真实后端 §6.3 八步未做，交由 worker 后续执行 |

## 表单 UX 硬约定核对

- 六字段原始输入快照判 dirty，空格改动也参与比较，改回原值恢复 clean；新建基线 enabled=true，编辑基线来自 findById；非 dirty refetch 同步，dirty 草稿保留并要求复核。纯快照/变基逻辑已测，真实交互未验。
- 父列表始终渲染 PermissionFormDialog，以 open 控制；表单没有提前返回导致 blocker 丢失的加载/错误分支。静态测试验证 blocker/discard 在 AppModal 之外及关闭时仍挂载。
- AppModal.onClose 和取消共用关闭函数，先检查 busy 和同步锁，再 guard(doClose)；预检和 POST 冻结输入/提交/取消。单行确认同样通过 onClose 的 pending 检查拦截 X/遮罩/Esc。实际关闭行为待浏览器验证。
- 成功路径先 markClean 再 doClose；失败保留表单与 dirty。提交令牌在关闭、open/id 变更、卸载时失效；每次预检/提交 await 返回核对令牌，POST 前读取实时详情 fetchStatus/dataUpdatedAt，中止旧版本并保留用户改动。此保护不是后端乐观锁。
- 名称、编码、类型均使用 RequiredMark，三个读屏器“（必填）”及星号经静态测试；真实 OptionSelect 的 `aria-label="权限类型（必填）"` 经静态渲染确认。
- 校验返回全部 `{field,message}[]`，同字段稳定取最相关错误；对应输入/下拉下方用 FieldError，编辑只清自身字段错误；整体请求错误在下次合法提交开始时清除。全部同步校验已测；提交后同时出现/编辑逐字段清错待浏览器验证。

## 后端证据冲突、偏离与未覆盖

1. 任务摘要写有“有关联检查”，但 spec §3.1 及只读 `PermissionServiceImpl.java:140–145` 明确 delete 仅 `.update(Permission::invalid)`，没有关联检查。按 spec 和后端证据实现：不限制关联记录删除，不移除记录/编码/角色关联，不承诺硬删除或登录会话权限立即撤销。旧契约测试的“物理删除”名称一并纠正。
2. findByPage 的 bean 不生效；列表/预检固定发送 page 从 1 递增、pageSize=100、bean={}，读取至响应实际 pageSize 的不足一页/空页，整页多读一页。检测页码、大小、重复页及没有新 ID 的满页；完成后按 ID 去重升序。额外拒绝读取期间分页大小变化，避免分页偏移导致静默漏项。多页传输没有事务快照，前端排序无法消除其他会话并发修改带来的偏移。
3. 名称不做唯一性；编码预检 trim 精确比较并折叠常见大小写差异，包含禁用记录、编辑排除自身；数据库唯一约束为最终保障，未将前端比较宣称为完整复制 MySQL collation。
4. 编辑 enabled=null 不操作时提交 null；groupName/description 清空提交空字符串，描述保留换行。未知类型显示原值、表单提示重选支持值，不默认替换成 MENU。
5. 浏览器交互 **未做 / 待 worker**：提供脚本覆盖三条件/分页、必填与逐字段错误、六字段四种关闭、详情迟到/未知类型、预检及错误码、busy 门禁、单行动作与删除保留、详情重取、路由/beforeunload及成功与待决后退。只完成语法检查，不能据此认定这些 UX 已交互验收通过。
6. 真实后端 §6.3 八步 **未做 / 待 worker**：没有创建或修改真实权限点/角色。尚无真实请求响应证据证明 enabled=true 出现在树、false 不出现、树缓存联动、delete 保留角色关联、DB 并发编码冲突及测试数据恢复。现有通过结果全部来自纯逻辑、受控契约、QueryObserver 与静态渲染。
7. 未扩展批量操作、权限层级、字典、菜单、工作流、角色分配或后端能力；新增 Vitest 配置仅用于本项可执行测试，相关 28 文件回归已通过。构建与全项目类型问题保留为既有阻断，未越界修复。
