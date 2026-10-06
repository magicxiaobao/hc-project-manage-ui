# p5-dynamic-buttons 实施记录（run273）

范围：本 worktree 内的 PermButton、ButtonRegistry、动作骨架、角色列表新增/编辑接入和测试。依据 coordinator_approved 的 `p5-p5-dynamic-buttons.md` 全文。未提交、未推送。

## run270 残留评估

逐个读取了任务列出的实现、单元测试、浏览器 fixture 和脚本，再运行基线检查。核心纯判权、真实交接订阅、全局 code 去重、原子批次注册、执行前会话检查及角色域两条定义已有实现，没有发现管理员兜底、另一权限源或额外 API 请求。

发现及处理：

1. 注册表 icon 校验接受任意对象，`icon: {}` 等错误配置会到 React 渲染阶段才失败。改为注册时拒绝，只接受函数组件和 React forwardRef/memo 类型；补非法字段、合法图标类型测试。
2. 角色列表 diff 将“分配权限”重新排版后接上注册表“编辑”，容易误读为回调交换。源码实际没有重复编辑；本轮恢复“分配权限”原代码，使 diff 只体现“新增角色”和“编辑”的替换。通过 biz 公开入口引用 RegisteredButtons。补浏览器数量断言、编辑目标 ID、分配权限导航目的地及撤权后仍保留分配权限的断言。
3. 浏览器 fixture 将 NODE_ENV 定义成 production，StrictMode 不会执行开发期挂载/清理重放。改为 development。
4. 自动化覆盖尚缺同步错误回传、延迟执行期间登出、显式 type/event 保留、不同列表行复用同一定义且零请求的断言。已补单元测试。补浏览器卸载后拒绝延迟副作用、同步/异步 handler 和 executor 错误回传且无 pageerror 的用例。
5. 未有最终验证证据。首轮相关测试 231 项通过；全仓 typecheck 发现 22 条已在 `.p5-typecheck-baseline.log` 中记录的既有错误；浏览器被当前沙箱阻止启动。最终结果及限制见下文，未用静态渲染冒充订阅重渲染验证。

## spec §1 验收标准核对

| 标准 | 实现与证据 | 验证限制 |
| --- | --- | --- |
| 1 精确授权与会话清理 | canUseButton 仅检查非空白原始 code、ready、非 null userId、grantedCodes.has(code)。真实 deriveSnapshot fixture、既有交接测试、同 revision 状态发布、旧事件及延迟执行撤权/登出/换号测试通过。注册表不写快照。 | 实际浏览器换号/显隐交互未执行成功。 |
| 2 hidden/disabled 和业务门禁 | hidden 在 render 中返回 fallback，不挂载按钮；disabled 使用 HeroUI isDisabled。排除并运行时过滤独立事件入口；onPress 重新读取交接快照并核对 userId/代际、isDisabled/isPending。默认 type=button，ref/原生属性沿用锁定 HeroUI 类型。 | 单元测试验证分支及直接受控事件；真实鼠标/键盘、ref 挂载断言在浏览器脚本中，受沙箱阻塞。 |
| 3 保存成功后显隐 | permission-save.test.tsx 使用现有 useAssignRolePermissions → requestAccessRefresh('authorization-change') → /me/menu producer → 真实交接订阅，验证草稿/失败不发布、撤销/再授予、仅 system:admin+ADMIN 不授权及刷新次数。 | 此单测验证订阅通知，不声称挂载重渲染。浏览器脚本同时挂载真实 RolePermissionsPage 和 RoleListLive，走原 mutation/refresh 链，但未成功运行；真实后端联调未完成。 |
| 4 仅追加定义即可出现编辑 | roles.ts 先注册 role:create，再追加 role:edit，使用同一 handle；通用组件无角色域分支。toolbar/row 均一次性接入。通用渲染测试证明仅追加定义可出现第二个按钮，回调使用正确行 ID。 | 真实角色弹窗、dirty 保留及分配权限导航的交互待浏览器执行。 |
| 5 可扩展 executor | 类型映射声明合并、registerActionKind、重复拒绝、内置 handler、缺失 kind hidden/disabled、明确 executed/cancelled/denied/failed、runAuthorized 最新快照/context/visible/disabled 复核均有测试。 | confirm/batch/external-link 只预留类型；测试 executor 不代表完整产品实现。 |

## spec §4、§5、§7 核对

- §4.1：仅新增规划模块并在 biz 入口导出；角色列表接入；无生产页面/路由增加。
- §4.2：useSyncExternalStore 使用 subscribeButtonPermissions/getButtonPermissionSnapshot/getButtonPermissionSnapshot 原函数，不复制快照、不按 revision 缓存 allowed。
- §4.3：ComponentPropsWithRef<typeof Button> 推导锁定 HeroUI 3 类型；受控 onPress 和最终 isDisabled 在属性展开之后设置；hidden/disabled/fallback 和业务 pending 保留。
- §4.4：每例可 new ButtonRegistry；跨域 code 全局唯一、同域追加顺序、批次原子性、只读数组/冻结定义及 payload、同步 visible 异常拒绝并报告。注册不要求已有授权。
- §4.5：静态本地 executor 注册，缺失 kind 拒绝；延迟执行通过 runAuthorized 复核，context 从已提交的最新页面 props 读取；失败交回页面 onActionError。没有真实确认、批量或外链产品功能。
- §4.6：role:create 仅 toolbar，role:edit 仅有效 row，调用页面回调设置原 formTarget；管理员页面/API 条件沿用现有实现。
- §5：RoleFormDialog 和 RolePermissionsPage 未修改；dirty-check、RequiredMark、FieldError、保存与离开守卫继续使用原实现。浏览器 fixture 覆盖打开表单后按钮撤权不清空输入，但本环境未完成该交互验证。
- §7：步骤 1–4 实现与单元测试已整理；步骤 5 的浏览器、真实后端和全仓零错误门禁仍受下面所列条件阻塞，不标为完整验收。

## 验证

最终相关测试命令（包含 spec 要求的新目录、角色表单/分配与全部既有 lib/API 契约）：

```sh
pnpm exec vitest run src/lib/access/__tests__ src/lib/buttons/__tests__ src/components/biz/__tests__ src/lib/__tests__ src/lib/query/__tests__/role-permissions.test.tsx src/components/pm/__tests__/role-permission-tree.test.tsx src/lib/api/__tests__
```

结果：exit 0，30 个测试文件、486 项测试通过。测试使用明确的 frontend fixture code；未将 fixture 当生产授权配置。

```sh
pnpm typecheck
pnpm build:dev
pnpm exec node --test scripts/dynamic-buttons.browser.mjs
pnpm exec node --test --test-isolation=none scripts/dynamic-buttons.browser.mjs
pnpm exec node --check scripts/dynamic-buttons.browser.mjs
git diff --check
```

- typecheck：exit 2，22 条既有错误，涉及事项导航 HistoryState / 无法解析 `@tanstack/history`（13 条）、login 的 HeroUI v2 属性（4 条）、projects 的 HeroUI v2 属性（5 条）。按钮相关文件无新增错误。不得将此结果称为全仓 typecheck 通过。修复会涉及 spec 外导航及用户明确禁止改动的路由文件；已向用户说明冲突并请求最小兼容修复授权，尚未收到答复，因此保持当前范围。
- build:dev：exit 1，login.tsx、projects.tsx 导入 HeroUI 3 未导出的 CardBody；转换完 3863 个模块后失败。无按钮新增模块构建错误。
- 浏览器：实际尝试运行，最新 fixture 可由 Vite 构建，但 Chromium 在 before hook 中失败，`sandbox_host_linux.cc:41 ... shutdown: Operation not permitted (1)`。4 个用例均未进入交互验证。环境内另一 Chromium 也因 socket 系统调用限制失败。没有提升权限或修改沙箱。现有依赖/本地缓存没有可用 DOM runner，未增加依赖。
- 脚本语法、git diff --check：exit 0。

## spec §2 非目标逐项核对

1. 没有修改后端、老前端、迁移 SQL 或生产权限/菜单数据；只在 ui-p5 写文件。
2. 没有修改动态路由、导航、认证刷新、access/auth store、路由守卫、Query 初始化或管理员路由兜底。
3. 没有新增判权 API、网络调用、Query hook/queryKey、Zustand 状态、localStorage、轮询、推送、广播、远程注册表或管理页。零请求 spy 覆盖注册、不同 props/行、渲染、读快照和发快照；现有保存 mutation 的 producer 请求另行验证。
4. 没有实现 confirm/batch/external-link 产品功能、任意脚本、动态 import 或批量选择 UI。
5. 仅迁移角色新增/编辑；分配权限、启用/禁用及普通 UI 按钮沿用原实现，不猜新的权限码。
6. 表单组件和提交授权不纳入改造，后端实际授权继续由现有接口负责。

## 真实联调前置与剩余工作

没有真实后端、测试账号或运行库有效菜单/Permission 数据证据，未发送真实角色权限修改请求。spec §3.4 的用户菜单管理员限制/未过滤/仅根节点缺口、role:create/role:edit 同码菜单配置、/me 当前权限并集，以及测试角色确实影响目标账号且没有其他角色授予同码，均仍需依赖项核实。

剩余门禁：获得范围外最小兼容修复授权后解决既有 typecheck/build 错误；在支持 Chromium 的环境运行四个挂载交互用例；使用满足 spec §3.4 前置的真实账号/数据完成 §6.3 联调。不能将本次单元和 fixture 构建结果当成真实接口验收完成。
