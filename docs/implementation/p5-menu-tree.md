# p5-menu-tree 实施记录（2026-10-05）

唯一实施依据：已评审 `hidden_files/specs/p5-p5-menu-tree.md`。所有改动位于 ui-p5 工作树，未暂存、未提交，未改 backend-ro 或轨道状态文件，无新增依赖。

## 交付

- `/sys/menus` 管理员路由，复用 permissions 的同步 hydrate/登录 redirect/system:admin 守卫；生成路由树保留 Start Register。未引入 `/sys` 布局或动态路由。
- 复用现有 `systemApi.menu` 与 API DTO；未修改或复制客户端。根列表 + 完整分页构树，字段和拓扑来自分页，根接口只决定现存真实根的优先顺序；三级展开/折叠、刷新保留展开 ID。异常关系可见、可编辑修复，不能作为父级依据。
- 八字段新建/编辑，详情 ID 检查、数值枚举、顶级 0、文本 trim/清空字符串；四个扩展字段省略。父级排除自身/后代/按钮及异常节点；完整读取尚未成功时拒绝保存并给 parentId 字段错误。
- 共用 RequiredMark/FieldError/useUnsavedChangesGuard，blocker 与弃改弹窗独立挂载；所有错误一起收集、字段编辑仅清自身；提交 ref 锁、会话令牌、详情版本冲突保护草稿，保存失败保留上下文。
- 启用/禁用分别显示，确认说明仅作用当前记录，不显示推断状态，无删除 UI/hook/客户端。成功失效 system.all，包括已查询用户结果；创建返回 0/非法 ID 进入失败分支。
- 用户 ID 显式查询、独立缓存、刷新错误提示；只展示用户接口返回节点，不拼管理树子节点；提示当前结果尚未按用户权限过滤。

## 文件清单

新增：

- `src/routes/sys/menus.tsx`
- `src/routes/sys/menus/index.tsx`
- `src/components/pm/menu-list-live.tsx`
- `src/components/pm/menu-tree.tsx`
- `src/components/pm/menu-form-dialog.tsx`
- `src/components/pm/menu-parent-select.tsx`
- `src/components/pm/menu-user-preview.tsx`
- `src/lib/menu-form.ts`
- `src/lib/menu-tree.ts`
- `src/lib/query/hooks/useMenus.ts`
- `src/lib/__tests__/menu-form.test.ts`
- `src/lib/__tests__/menu-tree.test.ts`
- `src/lib/query/__tests__/menus.test.tsx`
- `src/components/pm/__tests__/menu-tree.test.tsx`
- `src/components/pm/__tests__/menu-route.test.tsx`
- `scripts/menu-tree.browser.mjs`
- 本记录文件。

修改：

- `src/components/biz/option-select.tsx`：可选 isRequired 转发到现有 HeroUI Autocomplete，以落实必填控件可访问状态。
- `src/lib/query/index.ts`：导出 menu hooks。
- `src/routeTree.gen.ts`：注册菜单布局及索引路由，保留 Start Register 块。
- `src/lib/api/__tests__/system-contract.test.ts`：扩展菜单精确契约。

## 实测验证

工作目录为 `hidden_files/work/ui-p5`，测试均为客户端契约/纯逻辑/Query 行为/SSR 呈现，不等于真实后端或浏览器操作验收。

| 命令                                                                                                                                                                                                                                                         | 本次结果                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run src/lib/__tests__/menu-form.test.ts src/lib/__tests__/menu-tree.test.ts src/lib/query/__tests__/menus.test.tsx src/components/pm/__tests__/menu-tree.test.tsx src/components/pm/__tests__/menu-route.test.tsx`                         | 5 文件、62 测试通过；修正 QueryObserver 测试类型后 menus 套件再次通过 25 项。                                                                                              |
| `pnpm test:contract`                                                                                                                                                                                                                                         | 2 文件、101 测试通过。首次仅有一个测试预期把空格编码误写成 `+`；改为既有客户端的 `%20` 后重跑通过，无客户端变更。                                                          |
| `pnpm exec vitest run src/lib/__tests__/permission-form.test.ts src/lib/query/__tests__/permissions.test.tsx src/components/pm/__tests__/permission-list.test.tsx src/components/pm/__tests__/permission-route.test.tsx src/lib/__tests__/user-form.test.ts` | 5 文件、105 测试通过。                                                                                                                                                     |
| `pnpm exec vitest run src/lib/query/__tests__/menus.test.tsx src/lib/__tests__/user-form-submit.test.ts`                                                                                                                                                     | 2 文件、40 测试通过，其中新增 menus 25 项、既有会话/版本保护 15 项。                                                                                                       |
| `pnpm typecheck`                                                                                                                                                                                                                                             | exit 2；实施前基线 22 条既有错误，最终逐条核对基线，改动文件零新增。既有错误涉及 HistoryState/pmItemOrigin、@tanstack/history 类型增补及 login/projects 的旧 HeroUI 用法。 |
| `pnpm build`                                                                                                                                                                                                                                                 | exit 1；3842 modules transformed 后因未修改的 login.tsx/projects.tsx 导入不存在的 HeroUI CardBody 失败；未进入 db:migrate。                                                |
| 改动 TS/TSX/MJS 的 `pnpm exec eslint ...`                                                                                                                                                                                                                    | exit 0，无输出；routeTree.gen.ts 按仓库配置排除。                                                                                                                          |
| `git diff --check`                                                                                                                                                                                                                                           | exit 0，无输出。                                                                                                                                                           |
| `node --check scripts/menu-tree.browser.mjs`                                                                                                                                                                                                                 | exit 0，无输出；仅语法检查，未执行脚本。                                                                                                                                   |

## 未执行与后端限制

按用户决定不启动真实后端，也未启动 SPA 或执行浏览器脚本。dirty 各关闭方式、真实 DOM 交互、真实菜单写入/读回、启禁用状态过滤及两用户分配结果均未作浏览器/真实后端验收。

备用脚本沿用 permission-list 的 node:test + Playwright 模式。默认使用受控夹具，仅用于将来的前端浏览器行为检查；`P5_MENU_LIVE=1` 模式不拦截响应，用环境中的会话与两个真实用户 ID 进行真实写入/读回，并记录菜单路径和响应，最后禁用可识别前缀的创建记录。没有删除能力，不承诺清理记录。两种模式本次都未运行，不以 mock 或静态测试结果宣称联调通过。

源码限制仍存在：getMenuTree 仅有效根节点、菜单写入未驱逐服务端树缓存、getMenuTreeByUser 未按用户过滤、checkMenuPermission 固定 true。React Query 失效只刷新客户端，不证明树缓存实时同步或用户权限隔离；本项不修改后端。
