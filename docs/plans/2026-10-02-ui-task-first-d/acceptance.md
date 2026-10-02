# D 本地验收

父提交：`bd9bc5a5477a9c2486e18e8f1890b95fd48f6e47`。分支：`codex/ui-task-first-d-20261002`。本报告与七个 view 是本地 D 候选；精确最终提交见复审包 manifest/commit receipt。

## 接续与范围

检查实际 status/diff、检查点 JSON、草稿 patch 和 D 计划；草稿 SHA256 `0336d56c85291c38aceaeb36723dfcd46d92ca6e6497c0afe55cf336473f3681` 与检查点一致。保留全部旧 D 改动。初轮 28 图已复看；它们不算本轮业务验收。worktree 及原仓库/父目录未找到 AGENTS.md 或仓库级 .agents；读取全局 webapp-testing 等相关技能，使用已安装 Python Playwright，无安装。

精确 bd9 独立复验包已本地官方保存，复核 235475 bytes 和 SHA256 `01e814938a6da5633a4b72b0bfe62eeee92491ae46d7b5d99374b19cc8c4eede`，复用既有文件。其 noMajor 只属于基线，不能代表 D 独立复审。

白名单源文件限 dashboard/dependencies/releases/sprints/tests/trace/worklog 七个 view。只重排主任务、按需展开已有表单/汇总。store、domain、权限、状态机、审批、冻结、持久化、主 Vue 与 planned 功能均无修改。未做 E；无 push/PR/merge/deploy/远端分支删除/force。未操作远端，也未修正此前 R3 误推。

## 收口设计决定

- 原生 details 保持表单挂载；“收起（保留草稿）”不提交、不清空输入，并把焦点送回 summary。summary 可键盘 Enter 操作。
- 测试默认选既有 RUNNING；真实执行、取消和报告使用原 store。无运行时给出可展开创建的空态。运行选中使用 aria-pressed。
- 发布默认选既有待审批/已批准单；门禁及动作在展开明细之前，状态机、冻结与豁免校验沿用原合同；选中发布单使用 aria-pressed。
- 工时按待审批/我的登记/全部记录展示，负责人默认待审批，其余默认本人；角色在页面内切换也重新计算默认。审批权限和动作继续沿用既有合同，不按展示分区新增权限限制。
- 真实浏览器发现工时详情返回重置分区、版本详情返回折叠来源。修复仅在 view 内保存 SPA 会话的选择/展开状态，不写业务存储；工时按项目+用户记忆分区，测试/发布/追溯按项目记忆当前对象。刷新清除此类 UI 记忆。测试和版本的局部原生 toggle 监听在卸载时释放。
- 概览优先真实风险动作和我的未完成；不新算指标或虚构趋势。依赖先列冲突和既有依赖，影响信息就近展开。追溯选择器与当前对象在总览之前，当前总览行使用 aria-pressed。

## 本轮命令与退出码

| 命令 | 退出码 | 实际结果 |
| --- | --- | --- |
| `npm run test:pm` | 0 | 57/57 |
| `node --experimental-strip-types --test src/lib/app-data/app-data.test.ts src/lib/app-data/readiness-schedule.test.ts src/lib/auth/gate-identity.test.ts src/lib/auth/sign-in-gate.test.ts` | 0 | 55/55 |
| `npm run typecheck` | 0 | 无错误 |
| `node_modules/.bin/eslint` 后接七个改动 view | 0 | 0 error / 0 warning |
| `git diff --check` | 0 | 通过 |
| `VITE_AUTH_ENABLED=false npm run dev -- --port 4183 --strictPort` | 服务启动成功 | 指定 4183；未占用 8089/4179，收尾关闭 |
| `VITE_AUTH_ENABLED=false npm run build:dev` | 0 | 最终源开发构建；无 db:migrate |
| `VITE_AUTH_ENABLED=false npm run check:auth -- --dev-url http://127.0.0.1:4183` | 0 | dev/build 均 sign-in off |
| `npm run lint` | 1 | 既有 1 error / 8 warnings，未顺带修改 |
| `npm test` | 1 | 首段 187/195；8 项缺 .grok fixture/模板数据；后续 && 段未执行，PM/auth 已单独验证 |

认证检查第一次默认观察 8080，退出 2；随后显式使用 4183 通过。不把观察不到当通过。初期沙箱 Chromium MachPort 启动失败，申请限定本机浏览器验收后成功；无自动审批拒绝。脚本曾误判 details 的空 open 属性、隐藏选单按钮、追加集合索引和 evaluate 返回函数；修正后重跑，失败记录与最终结果分开保存。

## 浏览器证据

- 七条完整模块任务链通过，pageerrors 0：测试创建/开始/记录/完成报告与真实取消原因；发布提交/审批/无豁免门禁阻止/豁免后快照；工时登记/取消编辑不写/保存/通过/驳回；迭代创建/完成/开始/看板创建；依赖影响/作废启用/创建；追溯切换当前对象与总览选中；仪表盘真实行动链接与汇总。
- 六个有事项链接模块均实测详情 Back/Forward 两次，来源按钮恢复且尺寸非零；迭代没有事项详情链接，使用既有导航返回验证。
- 表单三次收起/重复打开保持草稿；收起操作前后业务数据相同。不存在 Cancel 的区域使用既有收起操作；工时编辑 Cancel 和测试取消原因确认前撤销单独验证。
- 七模块延迟真实本地模块载入时，既有路由 progressbar 均可见，载入后消失；加载图证另存。
- 17 项错误/回归任务通过，pageerrors 0：七模块真实 Storage getItem SecurityError 与重试不覆盖；七模块 setItem QuotaExceededError、beforeunload 防丢失监听、SPA 导航保留与重试保存；隔离空项目七模块；页面内角色切换；320x568 四列看板横滚与完整导航设置项可达。
- 新截图 64 张：七模块 320/390/768/1440 默认与展开共 56；320x568 默认 7；320x568 追溯菜单 1。附业务链、错误重试、空态与四列短屏图。28 张旧初轮图单独标识。
- 重复 summary 操作及键盘 Enter；所有可见操作控件横向在视口内，页面 document.scrollWidth 等于视口。12 个 (-1,-1) 测量标记为 HeroUI aria-hidden、tabindex=-1 的日期传输 input，不是可见操作控件。关键截图逐图/拼图复看，无正文重叠；既有有意 truncate 和内部滚动保留。
- 实际正常文字样本 498 个，最低对比 5.083，低于 4.5 的样本 0；图标/禁用控件不计正常文字。展开区和全选项菜单可滚至末端。

## 剩余限制

D 尚未经过另一位独立审阅者，不能标为 D noMajor。全仓既有 lint/fixture 失败仍在。本轮 auth-off 本地展示验收不代表生产认证或部署验证。局部展开/选择记忆只保证同一 SPA 会话；原表单不会新增刷新/跨路由草稿持久化能力。既有紧凑表格、排序、WIP 提示、前后切换/clone、真实重开原因、取消可见、URL 来源、四列滚动及菜单合同在相应源文件未改，相关 PM 单测及本轮重点回归通过。
